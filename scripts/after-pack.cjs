// electron-builder afterPack hook: ad-hoc sign the packed app when ORCH_ADHOC_SIGN=1
// (scripts/dist.sh). Unsigned apps are reported as "damaged" on other Macs; an
// ad-hoc signature turns that into the usual "unidentified developer" prompt.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(ctx) {
  if (process.env.ORCH_ADHOC_SIGN !== '1') return
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`)
  execFileSync(path.join(__dirname, 'sign-adhoc.sh'), [app], { stdio: 'inherit' })
}
