const {spawn} = require('node:child_process');
const children = [spawn('npm', ['run', 'build:ts', '--', '--watch'], {stdio: 'inherit'}),
    spawn('npm', ['run', 'build:css', '--', '--watch'], {stdio: 'inherit'})];
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => children.forEach(child => child.kill(signal)));
children.forEach(child => child.on('exit', code => { if (code) { children.forEach(c => c.kill()); process.exitCode = code; } }));
