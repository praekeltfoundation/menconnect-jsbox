module.exports = function(grunt) {
  grunt.loadNpmTasks("grunt-contrib-jshint");
  grunt.loadNpmTasks("grunt-mocha-test");
  grunt.loadNpmTasks("grunt-contrib-concat");
  grunt.loadNpmTasks("grunt-contrib-watch");

  grunt.initConfig({
    paths: {
      src: {
        app: {
          ussd_registration: "src/ussd_registration.js"
        },
        ussd_registration: [
          "src/index.js",
          "src/rapidpro.js",
          "src/whatsapp.js",
          "<%= paths.src.app.ussd_registration %>",
          "src/init.js"
        ],
        all: ["src/**/*.js"]
      },
      dest: {
        ussd_registration: "go-app-ussd_registration.js"
      },
      test: {
        ussd_registration: [
          "test/setup.js",
          "src/rapidpro.js",
          "src/whatsapp.js",
          "<%= paths.src.app.ussd_registration %>",
          "test/ussd_registration.test.js"
        ]
      }
    },

    jshint: {
      options: { jshintrc: ".jshintrc" },
      all: ["Gruntfile.js", "<%= paths.src.all %>", "test/*.js"]
    },

    watch: {
      src: {
        files: ["<%= paths.src.all %>"],
        tasks: ["build"]
      }
    },

    concat: {
      ussd_registration: {
        src: ["<%= paths.src.ussd_registration %>"],
        dest: "<%= paths.dest.ussd_registration %>"
      }
    },

    mochaTest: {
      options: {
        reporter: "spec"
      },
      test_ussd_registration: {
        src: ["<%= paths.test.ussd_registration %>"]
      }
    }
  });

  grunt.registerTask("test", ["jshint", "build", "mochaTest"]);

  grunt.registerTask("build", ["concat"]);

  grunt.registerTask("default", ["build", "test"]);
};
