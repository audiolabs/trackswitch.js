module.exports = function (grunt) {
  'use strict'

  // Force use of Unix newlines
  grunt.util.linefeed = '\n'

  RegExp.quote = function (string) {
    return string.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')
  }

  // Project configuration.
  grunt.initConfig({

    // Metadata.
    pkg: grunt.file.readJSON('package.json'),
    banner: '/*!\n' +
            ' * trackswitchjs v<%= pkg.version %> (<%= pkg.homepage %>)\n' +
            ' * Copyright <%= grunt.template.today("yyyy") %> International Audio Laboratories Erlangen\n' +
            ' * Licensed under MIT (https://github.com/audiolabs/trackswitchjs/blob/master/LICENSE)\n' +
            ' */\n',
    jqueryCheck: 'if (typeof jQuery === \'undefined\') {\n' +
                 '  throw new Error(\'trackswitchjs\\\'s JavaScript requires jQuery. jQuery must be included before trackswitchjs\\\'s JavaScript.\')\n' +
                 '}\n',
    jqueryVersionCheck: '+function ($) {\n' +
                        '  var version = $.fn.jquery.split(\' \')[0].split(\'.\')\n' +
                        '  if ((version[0] < 2 && version[1] < 9) || (version[0] == 1 && version[1] == 9 && version[2] < 1) || (version[0] >= 4)) {\n' +
                        '    throw new Error(\'trackswitchjs\\\'s JavaScript requires at least jQuery v1.9.1 but less than v4.0.0\')\n' +
                        '  }\n' +
                        '}(jQuery);\n\n',

    // Task configuration.
    clean: {
      dist: 'dist',
    },

    stamp: {
      options: {
        banner: '<%= banner %>\n<%= jqueryCheck %>\n<%= jqueryVersionCheck %>\n+function () {\n',
        footer: '\n}();'
      },
      js: {
        files: {
          src: '<%= concat.js.dest %>'
        }
      }
    },

    concat: {
      options: {
        // Custom function to remove all export and import statements
        process: function (src) {
          return src.replace(/^(export|import).*/gm, '')
        }
      },
      js: {
        src: [
          'js/trackswitch.js'
        ],
        dest: 'dist/js/<%= pkg.name %>.js'
      },
      css: {
        src: [
          'dist/tmp/reset.css',
          'css/trackswitch.css'
        ],
        dest: 'dist/tmp/concat.css'
      }
    },

    connect: {
      server: {
        options: {
          livereload: true,
          base: './',
          port: 8000,
          open: 'http://localhost:8000/examples/'
        }
      }
    },

    watch: {
      scripts: {
        files: 'js/*.*',
        tasks: ['dist-js'],
        options: {
          interrupt: true,
        }
      },
      css: {
        files: 'css/*.*',
        tasks: ['dist-css'],
        options: {
          interrupt: true,
        }
      }
    },

    cssmin: {
      options: {
        mergeIntoShorthands: false,
        roundingPrecision: -1
      },
      target: {
        files: {
          'dist/css/trackswitch.min.css': ['dist/tmp/concat.css']
        }
      }
    },

    uglify: {
      main: {
        files: {
          'dist/js/trackswitch.min.js': ['dist/js/trackswitch.js']
        }
      }
    },

    compress: {
      main: {
        options: {
          archive: 'trackswitchjs-<%= pkg.version %>-dist.zip',
          mode: 'zip',
          level: 9,
          pretty: true
        },
        files: [
          {
            expand: true,
            cwd: 'dist/',
            src: ['css/*', 'js/*'],
            dest: 'trackswitchjs-<%= pkg.version %>-dist'
          }
        ]
      }
    },

    exec: {
      sass: {
        command: 'npm run sass'
      }
    },

    'gh-pages': {
      options: {
        base: 'dist',
        add: true
      },
      src: [
        'css/*',
        'js/*',
      ]
    }

  })


  // These plugins provide necessary tasks.
  require('load-grunt-tasks')(grunt)
  require('time-grunt')(grunt)
  grunt.loadNpmTasks('grunt-gh-pages');

  grunt.registerTask('dist-js', ['concat:js', 'stamp', 'uglify'])

  grunt.registerTask('dist-css', ['exec:sass', 'concat:css', 'cssmin'])

  grunt.registerTask('dist', ['clean:dist', 'dist-css', 'dist-js'])

  grunt.registerTask('serve', ['dist', 'connect:server', 'watch']);

  grunt.registerTask('default', ['dist'])
}
