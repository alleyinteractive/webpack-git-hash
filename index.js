/**
 * Webpack plugin for versioning bundles and chunks with the hash of the last Git commit
 */

var fs = require('fs-extra');
var path = require('path');
var child_process = require('child_process');

/**
 * Setup bindings and options
 */
function WebpackGitHash(opts) {
  // Bind methods that need it
  this.doPlaceholder = this.doPlaceholder.bind(this);
  this.cleanupFiles = this.cleanupFiles.bind(this);
  this.replaceAsset = this.replaceAsset.bind(this);
  this.populateRegex = this.populateRegex.bind(this);
  this.deleteObsoleteFile = this.deleteObsoleteFile.bind(this);
  this.loopAssets = this.loopAssets.bind(this);

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
WebpackGitHash.prototype.deleteObsoleteFile = function(file) {
  var regexKeys = Object.keys(this.regex);

  for (var i = 0; i < regexKeys.length; i++) {
    var currentRegex = this.regex[regexKeys[i]];
    var testPath = file.path.replace(this.outputPath, '');

    if (currentRegex.test(testPath)) {
      fs.unlink(file.path, function(err) {
        if (err) {
          console.log(err);
        }
        console.log('WebpackGitHash: Deleted ' + file.path);
      });
      this.deletedFiles.push(file.path);
    }
  }
}

/**
 * Add a regex for a particular asset
 */
WebpackGitHash.prototype.populateRegex = function(assetName) {
  if (!this.regex.hasOwnProperty(assetName)) {
    this.regex[assetName] = this.buildRegex(assetName, this.skipHash);
  }
}

/**
 * Remove files with outdated hash
 */
WebpackGitHash.prototype.cleanupFiles = function() {
  console.log('WebpackGitHash: Cleaning up files; skipping hash: ' + this.skipHash);
  fs.walk(this.outputPath)
    .on('data', function(file) {
      this.deleteObsoleteFile(file);
    }.bind(this));
}

/**
 * Loop through assets, replace placeholder, and generate regex
 */
WebpackGitHash.prototype.replaceAsset = function(compilation, assetName) {
  var hashedAssetName = this.doPlaceholder(assetName);

  for (var i = 0; i < compilation.chunks.length; i++) {
    var chunk = compilation.chunks[i];

    for (var j = 0; j < chunk.files.length; j++) {
      var file = chunk.files[j];

      if (assetName === file) {
        compilation.chunks[i].files[j] = hashedAssetName;
      }
    };
  };

  if (hashedAssetName) {
    compilation.assets[hashedAssetName] = compilation.assets[assetName];
    delete compilation.assets[assetName];
  }
  console.log('WebpackGitHash: hash added to ' + assetName);

  this.populateRegex(assetName);
}

/**
 * Callback function if one exists
 */
WebpackGitHash.prototype.doCallback = function(stats) {
  // Webpack stats passed directly, or stored earlier, or null
  if (typeof this.callback === 'function') {
    this.callback(this.skipHash, this.deletedFiles, stats || this.stats);
  }
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
  var regex = template;

  // escape dots, e.g.
  // '\\w+-chunk.1234567.js' -> '\\w+-chunk\\.1234567\\.js'
  regex = regex.replace(/\./g, '\\.');

  // replace hash
  // '\\w+-chunk\\.1234567\\.min\\.js' -> '\\w+-chunk\\.(?!1234567)\\w{7}\\.min\\.js'
  regex = regex.replace(this.placeholder, '(?!' + hash + ')\\w{' + hash.length + '}');

  // Filename must come at end of string to avoid `filename.css` matching `filename.css.map`
  // Add optional forward slash
  regex = '(/)?' + regex + '$'

  // String must be at the end of the filename (to prevent sourcemaps from matchin too many regexes)
  return new RegExp(regex);
}

/**
 * Attempt to replace the placeholder string in a output string
 */
WebpackGitHash.prototype.doPlaceholder = function(original) {
  var newString = original.replace(this.placeholder, this.skipHash);
  if (newString === original) {
    return false;
  }
  return newString;
}

/**
 * Loop through assets just before they are emitted to replace placeholder
 */
WebpackGitHash.prototype.loopAssets = function(compilation, callback) {
  var assetNames = Object.keys(compilation.assets);

  for (var i = 0; i < assetNames.length; i++) {
    this.replaceAsset(compilation, assetNames[i]);
  }

  if (this.cleanup) {
    this.cleanupFiles();
  }

  // Exit 'emit' hook
  callback();
}

/**
 * Hook into webpack plugin architecture
 */
WebpackGitHash.prototype.apply = function(compiler) {

  if (!this.outputPath) {
    this.outputPath = compiler.options.output.path;
  }

  compiler.plugin('emit', this.loopAssets);
  compiler.plugin('done', this.doCallback);
}

module.exports = WebpackGitHash;
