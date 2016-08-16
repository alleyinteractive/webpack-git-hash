/**
 * Webpack plugin to cleanup chunks with a Git has OTHER THAN a specific hash
 *  Of no hash is specified, defaults to most recent
 *  To run from the command line, use:
 *  CLEANUPCHUNKS=true node ./CleanupChunks.js [<specify hash>]
 */

var fs = require('fs');
var path = require('path');
var getLastHash = require('./getLastHash');
var isUnusedFilename = require('./isUnusedFilename');
var doingCleanup = process.env.PRODUCTION === 'true' || process.env.CLEANUPCHUNKS === 'true';

/**
 * The module.
 *
 * @param string skipHash Hash to skip, or default to most recent
 */
function CleanupChunks(skipHash) {
  this.skipHash = skipHash || getLastHash();
  // If no paths were sent, check command line arg for test path *relative* to this file
  if (!this.skipHash) {
    throw new Error('skipHash not found')
  }

  // Should only apply if not initialized by Webpack
  this.staticPath = this.staticPath || path.join(__dirname, '../../static/js')

  // Regex tests for filenames containing chunk.HASH.min.js
  //  where HASH does not match the hash we want to skip
  //  but is the same number of characters
  this.regex = new RegExp('chunk\\.(?!' + this.skipHash + ')\\w{' + this.skipHash.length + '}\\.min\\.js');
};

/**
 * Test if a file can be deleted, then delete it
 */
CleanupChunks.prototype.deleteChunk = function(filename) {
  if (this.regex.test(filename) || isUnusedFilename(filename)) {
    if (!doingCleanup) {
      console.log(filename + ' not deleted');
    }
    fs.unlink(path.join(this.staticPath, filename), function(err) {
      if (err) {
        throw err;
      }
      console.log('Deleted ' + filename);
    })
  }
}

/**
 * Loop through files after reading folder contents
 */
CleanupChunks.prototype.loopFiles = function(err, contents) {
  if (err) {
    throw err;
  }
  contents.forEach(this.deleteChunk.bind(this));
}

/**
 * Delete static chunk JS files containing a hash other than the one we want to skip
 */
CleanupChunks.prototype.init = function() {
  if (!doingCleanup) {
    console.log('Skipping cleanup process');
    return;
  }
  console.log('Cleaning up chunk files; skipping hash ' + this.skipHash);
  if (this.logWebpackPath) {
    console.log(this.logWebpackPath);
  }
  fs.readdir(this.staticPath, this.loopFiles.bind(this));
}

/**
 * Hook into webpack plugin architecture
 */
CleanupChunks.prototype.apply = function(compiler) {
  this.staticPath = path.join(compiler.options.output.path, 'js');
  this.logWebpackPath = 'Using webpack output path: ' + compiler.options.output.path;
  compiler.plugin('done', this.init.bind(this));
}

/**
 * Check for command line testing
 */
if (process.env.CLEANUPCHUNKS === 'true') {
  var cleanup = process.argv.length >= 3 ?
    new CleanupChunks(process.argv[2]) : new CleanupChunks();
  cleanup.init();
}

module.exports = CleanupChunks;
