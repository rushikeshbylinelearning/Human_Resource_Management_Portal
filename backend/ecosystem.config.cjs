// PM2 config for attendance-test.bylinelms.com ONLY.
// Do not start this on the production app. Production AMS stays on :3011.
module.exports = {
  apps: [
    {
      name: 'attendancetest-backend',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3015,
        HOST: '127.0.0.1',
      },
    },
  ],
};
