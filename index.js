/**
 * Webpack plugin for versioning bundles and chunks with the hash of the last Git commit
 */

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

/**
 * Setup bindings and options
 */
function WebpackGitHash(opts) {
  // Bind methods that need it
  this.doPlaceholder = this.doPlaceholder.bind(this);
  this.cleanupFiles = this.cleanupFiles.bind(this);
  this.loopFiles = this.loopFiles.bind(this);
  this.deleteObsoleteFile = this.deleteObsoleteFile.bind(this);

  opts = opts || {};

  // Custom placeholder or default to [githash]
  this.placeholder = opts.placeholder || '[githash]';

  // Delete old versions?
  this.cleanup = opts.cleanup || false;

  // If not cleaning up, bind the callback directly
  if (!this.cleanup) {
    this.doCallback = this.doCallback.bind(this);
  }

  // Can specify a specific hash/version
  if (opts.skipHash) {
    this.skipHash = opts.skipHash;
    this.hashLength = this.skipHash.length;
  } else {
    // Or specify how many chars to use from the last commit hash
    this.hashLength = opts.hashLength || 7;
    this.skipHash = this.getSkipHash(this.hashLength);
  }

  // Can specify output path
  this.outputPath = opts.outputPath || null;

  // Pre-specify regexes for filename and chunkFilename
  this.regex = opts.regex || {};

  // Optional callback function that receives the hash and list of deleted files
  this.callback = opts.callback || null;
  if (typeof this.callback === 'function') {
    this.callback = this.callback.bind(this);
  }

  // Config filled in later
  this.updated = {};
  this.deletedFiles = [];
  this.stats = null;
};

/**
 * Test if a file can be deleted, then delete it
 */
WebpackGitHash.prototype.deleteObsoleteFile = function(filename) {
  if ((this.regex.filename && this.regex.filename.test(filename)) ||
    (this.regex.chunkFilename && this.regex.chunkFilename.test(filename))) {
    // delete synchronously so we know when loopFiles() is complete
    fs.unlinkSync(path.join(this.outputPath, filename));
    console.log('Deleted ' + filename);
    this.deletedFiles.push(filename);
  }
}

/**
 * Loop through files after reading folder contents
 */
WebpackGitHash.prototype.loopFiles = function(err, contents) {
  if (err) {
    throw err;
  }
  contents.forEach(this.deleteObsoleteFile);
  this.doCallback();
}

/**
 * Callback function if one exists
 */
WebpackGitHash.prototype.doCallback = function(stats) {
  // Webpack stats passed directly, or stored earlier, or null
  stats = stats || this.stats;
  if (typeof this.callback === 'function') {
    this.callback(this.skipHash, this.deletedFiles, stats);
  }
}

/**
 * Delete static chunk JS files containing a hash other than the one we want to skip
 */
WebpackGitHash.prototype.cleanupFiles = function(stats) {
  console.log('Cleaning up Webpack files; skipping ' + this.placeholder + ': ' + this.skipHash);
  // Save Webpack stats for later
  if (stats) {
    this.stats = stats;
  }
  fs.readdir(this.outputPath, this.loopFiles);
}

/**
 * Get hash of last git commit
 */
WebpackGitHash.prototype.getSkipHash = function(length) {
  var skipHash = child_process.execSync('git rev-parse --short=' + length + ' HEAD', { encoding: 'utf8' });
  return skipHash.trim();
}

/**
 * Turn processed filename into regex for later cleanup
 */
WebpackGitHash.prototype.buildRegex = function(template, hash) {
  // discard any prepended directories
  var parts = template.split('/');
  var regex = parts.pop();

  // Replace Webpack placeholders, e.g.
  // '[name]-chunk.1234567.min.js' -> '[-_\\w]+-chunk.1234567.min.js'
  regex = regex.replace(/\[\w+\]/gi, '[-_\\w]+');

  // escape dots, e.g.
  // '\\w+-chunk.1234567.js' -> '\\w+-chunk\\.1234567\\.js'
  regex = regex.replace(/\./g, '\\.');

  // replace hash
  // '\\w+-chunk\\.1234567\\.min\\.js' -> '\\w+-chunk\\.(?!1234567)\\w{7}\\.min\\.js'
  regex = regex.replace(hash, '(?!' + hash + ')\\w{' + hash.length + '}');

  return new RegExp(regex);
}

/**
 * Atttempt to replace the placeholder string in a output string
 */
WebpackGitHash.prototype.doPlaceholder = function(key, original) {
  var newString = original.replace(this.placeholder, this.skipHash);
  if (newString === original) {
    return false;
  }
  this.regex[key] = this.regex[key] || this.buildRegex(newString, this.skipHash);
  return newString;
}

/**
 * Hook into webpack plugin architecture
 */
WebpackGitHash.prototype.apply = function(compiler) {

  // Process filename and chunkFilename
  this.updated.filename = compiler.options.output.filename ?
    this.doPlaceholder('filename', compiler.options.output.filename) : false;
  if (this.updated.filename) {
    compiler.options.output.filename = this.updated.filename;
    console.log('Changed output.filename to ' + compiler.options.output.filename);
  }

  this.updated.chunkFilename = compiler.options.output.chunkFilename ?
    this.doPlaceholder('chunkFilename', compiler.options.output.chunkFilename) : false;
  if (this.updated.chunkFilename) {
    compiler.options.output.chunkFilename = this.updated.chunkFilename;
    console.log('Changed output.chunkFilename to ' + compiler.options.output.chunkFilename);
  }

  if (!this.outputPath) {
    this.outputPath = compiler.options.output.path;
  }

  if (this.cleanup === true &&
    (this.updated.filename || this.updated.chunkFilename)) {
    compiler.plugin('done', this.cleanupFiles);
  } else {
    compiler.plugin('done', this.doCallback);
  }
}

module.exports = WebpackGitHash;
