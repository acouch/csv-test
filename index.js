var _ = require('lodash'),
    chalk = require('chalk'),
    fs = require('fs'),
    glob = require("glob"),
    path = require('path'),
    yaml = require('js-yaml'),
    parse = require('csv-parse'),
    validator = require('validator'),
    transform = require('stream-transform');

module.exports = function(yml, arg, validators) {
  var indexCount = [];
  var indexErrorCount = [];
  var indexFilePath = [];
  var indexErrors = [];

  var proc = glob(arg);
  proc.on('end',function(files){
    _.each(files, function(file,index) {
      var filePath = path.resolve(process.cwd(), file);
      indexCount[index] = 0;
      indexErrorCount[index] = 0;
      indexFilePath[index] = filePath;
      indexErrors[index] = [];
      parseStream(filePath,yml,index);
    });
  });

  if (validators && _.isObject(validators)) addValidators(validators);

  function parseStream(filePath,yml,index) {
    var stream = fs.createReadStream(filePath, 'utf8');

    var config = yaml.safeLoad(yml),
        settings = _.extend({ columns: true }, config.settings),
        parser = parse(settings),
        transformer = transform(testRow);

    stream.pipe(parser).pipe(transformer);
    stream.on('end', finish);

    function testRow(row) {
      indexCount[index]++;

      _.each(row, function(value, field) {

        var error = testField(value, field, row, config, index);
        if (error) console.error(chalk.red(error));
      });
    }

    function testField(value, field, row, config, index) {
      var fieldIndex = '✗ [row ' + indexCount[index] + ', field ' + field + '] ',
          rules = config.fields[field],
          output = [];

      rules = _.isString(rules) ? [rules] : rules;

      _.each(rules, function(options, rule) {
        if (_.isArray(rules)) {
          rule = options;
          options = undefined;
        }

        if (_.isObject(rule)) {
          options = _.values(rule)[0];
          rule = _.keys(rule)[0];
        }

        var args = _.isArray(options) ?
              [value].concat(options) : [value, options],
            test = validator[rule];

        if (!test) throw new Error('`' + rule + '` is not a valid rule.');

        this.row = row;
        this.field = field;
        this.value = value;

        if (!test.apply(this, args)) {
          indexErrorCount[index]++;
          indexErrors[index].push(fieldIndex + '`' + rule + '` failed.');
        }
      });

    }

    function finish() {
      console.log("Results for " + indexFilePath[index]);
      console.log(indexCount[index] + ' rows tested');
      if (indexErrorCount[index]) {
        var label = indexErrorCount[index] === 1 ? ' error' : ' errors';
        _.each(indexErrors[index], function(error) {
          console.log(chalk.red(error));
        });
        console.log(chalk.red(indexErrorCount[index] + label + ' found'));
        process.exitCode = 1;
      } else {
        console.log(chalk.green('no errors found'));
      }
    }

  }

  function addValidators(validators) {
    _.each(validators, function(func, key) {
      validator.extend(key, func);
    });
  }

};
