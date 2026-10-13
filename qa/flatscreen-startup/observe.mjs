import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const out='artifacts';fs.mkdirSync(out,{recursive:true});
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(head,process.env.EXPECTED_HEAD);
const expected='30610830deea8acf73cc812bb9c61b2d15321751bbf9036e1e727052f013c63b';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(fs.readFileSync('../../index.html')),expected);
const report={head,expected,url:'https://tront.xyz/godgame/',method:'No capture mode, state injection, projected target coordinates, or fake clock. Fresh ordinary browser page, real-time screenshot and read-only state observation.',errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:2048,height:1044},deviceScaleFactor:1,recordVideo:{dir:out+'/video',size:{width:2048,height:1044}}});
try {
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
const response=await page.goto(report.url,{waitUntil:'load'});assert(response.ok());assert.equal(hash(await response.body()),expected);
await page.waitForFunction(()=>window.SETTLEMENTQA||window.SETTLEMENTERROR,null,{timeout:60000});
assert.equal(await page.evaluate(()=>window.SETTLEMENTERROR??null),null);
await page.waitForTimeout(1500);
report.initial=await page.evaluate(()=>SETTLEMENTQA.state());
await page.screenshot({path:out+'/initial.png'});
const jpeg=await page.screenshot({type:'jpeg',quality:50,scale:'css'});
console.log('SCREENSHOT_INITIAL_JPEG_BASE64='+jpeg.toString('base64'));
console.log('INITIAL_STATE='+JSON.stringify(report.initial));
report.success=true;
} catch(e) {report.error=String(e.stack||e);process.exitCode=1;} finally {await context.close();await browser.close();fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log('REPRO_REPORT='+JSON.stringify(report));}
