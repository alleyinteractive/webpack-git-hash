/**
 * Unit tests
 */

var expect = require('chai').expect;
var fs = require('fs');
var path = require('path');
var rimraf = require('rimraf');
var WebPackGitHash = require('../');

describe('webpack-git-hash test suite', function() {
  var testTmpDir = path.join(__dirname, 'tmp');
  var testTmpDirContents = [];

  before(function() {
    fs.mkdirSync(testTmpDir);
  });

  after(function() {
    rimraf.sync(testTmpDir);
  });

  it('should be a function', function() {
    expect(WebPackGitHash).to.be.a('function');
  });

  it('should set up default options correctly', function() {
    var test = new WebPackGitHash();
    expect(test.placeholder).to.equal('[githash]');
    expect(test.cleanup).to.equal(false);
    expect(test.hashLength).to.equal(test.skipHash.length);
    expect(test.hashLength).to.equal(7);
  });

  it('should set up custom options correctly', function() {
    var callbackResult;
    var test = new WebPackGitHash({
      placeholder: '[custom]',
      cleanup: true,
      skipHash: '1234',
      callback: function(hash) { callbackResult = hash; }
    });
    expect(test.placeholder).to.equal('[custom]');
    expect(test.cleanup).to.equal(true);
    expect(test.skipHash).to.equal('1234');
    expect(test.hashLength).to.equal(test.skipHash.length);
    expect(test.hashLength).to.equal(4);
    test.doCallback()
    expect(callbackResult).to.equal('1234');
  });

  it('should cleanup files not matching the supplied hash', function() {
    // Create some dummy files
    ['abcdefg', 'hijklmn', '1234567', '890wxyz'].forEach(function(hash) {
      var filename = 'file-' + hash + '.min.js';
      fs.writeFileSync(path.join(testTmpDir, filename), 'temp file', 'utf8');
    });

    // Set up webpack-git-hash
    var test = new WebPackGitHash({
      skipHash: 'abcdefg',
      cleanup: true,
      outputPath: testTmpDir,
      regex: {
        filename: /file-(?!abcdefg)\w{7}\.min\.js/
      }
    });

    // Cleanup files and test the result
    test.cleanupFiles();
    setTimeout(function() {
      // Only the file that matched the hash should still be there
      testTmpDirContents = fs.readdirSync(testTmpDir);
      expect(testTmpDirContents.toString()).to.equal('.,..,file-abcdefg.min.js');

      // Files not matching the supplied hash should be in deletedFiles
      expect(test.deletedFiles.length).to.equal(3);
      expect(test.deletedFiles[0]).to.equal('file-hijklmn.min.js');
      expect(test.deletedFiles[1]).to.equal('file-1234567.min.js');
      expect(test.deletedFiles[2]).to.equal('file-890wxyz.min.js');
    }, 500);
  });

  it('should call the callback function', function() {
    var testVar = 0;
    function testCallback() {
      testVar++;
    };
    var mockCompiler = {
      options: {
        output: false
      },
      plugin: function(evt, callback) {
        callback();
      }
    };

    // Create tester and trigger the callback
    var testCleanup = new WebPackGitHash({
      callback: testCallback
    });
    testCleanup.apply(mockCompiler);
    expect(testVar).to.equal(1);
  });

});
