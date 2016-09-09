/**
 * Unit tests
 */

var expect = require('chai').expect;
var fs = require('fs-extra');
var path = require('path');
var WebPackGitHash = require('../');

describe('webpack-git-hash test suite', function() {
  var testTmpDir = path.join(__dirname, 'tmp');
  var testTmpDirContents = [];

  before(function() {
    fs.mkdirSync(testTmpDir);
  });

  after(function() {
    fs.removeSync(testTmpDir);
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

  it('replace placeholder with hash and generate regex', function() {
    // Set up webpack-git-hash
    var test = new WebPackGitHash({
      skipHash: 'abcdefg',
      cleanup: true,
      outputPath: testTmpDir,
    });
    var filename = 'file.' + test.placeholder + '.min.js';
    var oldFilename = 'file.1234567.min.js';
    var compilation = {
      assets: {}
    }

    compilation.assets[filename] = 'test';

    // Cleanup files and test the result
    var replacedFilename = test.replaceAsset(compilation, filename);
    expect(test.regex.length).to.equal(1);
    expect(test.regex[0].test(filename)).to.equal(false);
    expect(test.regex[0].test(oldFilename)).to.equal(true);
    expect(compilation.assets).to.have.property('file.abcdefg.min.js').and.to.equal('test');
  });

  it('should cleanup files not matching the supplied hash', function() {
    var filenames = [];
    // Set up webpack-git-hash
    var test = new WebPackGitHash({
      skipHash: 'abcdefg',
      cleanup: true,
      outputPath: testTmpDir,
      regex: {
        filename: /file-(?!abcdefg)\w{7}\.min\.js/
      }
    });

    // Create some dummy files
    ['abcdefg', 'hijklmn', '1234567', '890wxyz'].forEach(function(hash) {
      var filename = 'file-' + hash + '.min.js';
      filenames.push(filename);
      fs.writeFileSync(path.join(testTmpDir, filename), 'temp file', 'utf8');
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
    var testCallback = function() {
      testVar++;
    };
    // Create tester and trigger the callback
    var test = new WebPackGitHash({
      callback: testCallback
    });
    // Compiler
    var mockCompiler = {
      options: {
        output: false
      },
      assets: {
        'filename.min.js': 'test',
      },
      plugin: function(evt, callback) {
        if ('done' === evt) {
          callback();
        }
      }
    };

    test.apply(mockCompiler);
    expect(testVar).to.equal(1);
  });

});
