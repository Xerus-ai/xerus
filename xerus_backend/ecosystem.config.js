module.exports = {
    apps: [{
        name: 'xerus-backend',
        script: 'dist/index.js',
        cwd: '/opt/xerus/xerus_backend',
        env: {
            NODE_ENV: 'production',
        },
        instances: 1,
        exec_mode: 'fork',
        watch: false,
        max_memory_restart: '512M',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    }],
};
