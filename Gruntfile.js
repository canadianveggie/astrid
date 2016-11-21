module.exports = function (grunt) {

	grunt.initConfig({
		bower: {
			install: {
				options: {
					targetDir: 'vendor'
				}
			}
		}
	});

	grunt.loadNpmTasks('grunt-bower-task');

	grunt.registerTask('default', ['bower:install']);
};
