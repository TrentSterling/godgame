import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const head=git('rev-parse','HEAD');assert.equal(head,process.env.EXPECTED_HEAD);
const expected='fff7bad7f5dce9114a522c140f5adb1613b0e04734305bc62f3547371bdf6f79';
const root=fs.readFileSync('../../index.html');
assert.equal(sha(root),expected);assert.equal(root.length,8495013);
assert(root.equals(fs.readFileSync('../priority-feedback/candidate.html')),'Exact reviewed construction-priority candidate equals release root');
const shrine=fs.readFileSync('../../shrine-v24.html');assert.equal(sha(shrine),'ba699ca9ad9b393c0be3cfec528c4ff8bc391cd117d6edac7e56e47578a7cebc');assert.equal(shrine.length,7031668);
const expectedBlobs={
 'index.html':'f0fd378b4512559dba18a67d66c257c6308a8c9a',
 'shrine-v24.html':'36e7f52012164164ec6553607963df301ba6f798',
 'THIRD_PARTY_LICENSES.txt':'7c5bca6a6c7bbc43156ba6a1c34422adbca3e7c4',
 '.nojekyll':'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'
};for(const [file,blob]of Object.entries(expectedBlobs))assert.equal(git('rev-parse',`HEAD:${file}`),blob,'Exact release/preserved file '+file);
fs.mkdirSync('artifacts',{recursive:true});const report={passed:true,head,tree:git('rev-parse','HEAD^{tree}'),rootSha256:expected,rootBytes:root.length,shrineSha256:sha(shrine),shrineBytes:shrine.length,blobs:expectedBlobs,acceptedBrowserRun:'https://github.com/TrentSterling/godgame/actions/runs/38472384710',acceptedRePlacementRun:'https://github.com/TrentSterling/godgame/actions/runs/38376374722',scope:'Exact root bytes equal the reviewed construction-priority candidate. The inherited four-case ordinary-input startup suite and village browser suites rerun against these bytes. Preserve unchanged Shrine v24, licenses and .nojekyll. Root-path smoke is separate; hardware HMD testing remains unverified.'};fs.writeFileSync('artifacts/release-identity.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));

