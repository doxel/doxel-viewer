var gulp=require('gulp'),
  wiredep=require('wiredep'),
  sass=require('gulp-ruby-sass'),
  autoprefixer=require('gulp-autoprefixer'),
  notify=require('gulp-notify'),
  bower=require('gulp-bower'),
  connect=require('gulp-connect')
  cors=require('cors')
  opn=require('opn');

var config={
  sassPath: './style',
  bowerDir: './bower_components'
}

// install bower dependencies
gulp.task('bower', function(){
  return bower()
    .pipe(gulp.dest(config.bowerDir));
});

// inject bower dependencies in html index
gulp.task('wiredep', function(){
  wiredep({
    src: 'viewer.html',
    verbose: true
  });
});

gulp.task('connect', function(){
  connect.server({
    root: '.',
    middleware: function(){
      return [cors()];
    },
    livereload: true
  });
});

gulp.task('html',function(){
  gulp.src('viewer.html')
  .pipe(connect.reload());
});

gulp.task('open',function(){
  opn('http://localhost:8080/viewer.html?src=example');
});

gulp.task('watch',function(){
  gulp.watch(['viewer.html'],['html']);
});

gulp.task('default',['bower','wiredep','connect','open','watch']);

