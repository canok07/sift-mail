const {spawnSync}=require('node:child_process');
const {mkdtempSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const directory=mkdtempSync(path.join(os.tmpdir(),'sift-security-test-'));
const result=spawnSync(process.execPath,['--import',pathToFileURL(require.resolve('tsx/esm')).href,'--test',path.resolve('tests/security.test.ts')],{cwd:directory,env:{...process.env,SIFT_DATA_DIR:path.join(directory,'data')},stdio:'inherit'});
process.exitCode=result.status || (result.error?1:0);
