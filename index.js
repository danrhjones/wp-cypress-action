// @ts-check
const core = require('@actions/core')
const exec = require('@actions/exec')
const io = require('@actions/io')
const quote = require('quote')

const installDependancies = () => {

  console.log('in installDependancies')
  core.debug('installing NPM dependencies using Yarn')
  return io.which('yarn', true).then(yarnPath => {
    core.debug(`yarn at "${yarnPath}"`)
    return exec.exec(
        `"${yarnPath}" install --frozen-lockfile`,
        [])
  })

  // exec.exec(`"${npxPath}" percy exec ${flags} -- ${testCommand}`, [], execOptions);
}

const runWpCypress = () => {
  console.log('In runWpCypress')

  console.log('start cypress')
  return io.which('yarn', true).then(yarnPath => {
    return exec.exec(
        `"${yarnPath}" run wp-cypress start`,
        []
    )
  })
}

const listPackages = () => {
  console.log('In list packages')

  console.log('yarn list')
  return io.which('yarn', true).then(yarnPath => {
    core.debug(`yarn at "${yarnPath}"`)
    return exec.exec(
        `"${yarnPath}" list --depth=0`,
        []
    )
  })
}

const runTests = () => {
  console.log('In run tests')

  console.log('yarn list')
  return io.which('yarn', true).then(yarnPath => {
    core.debug(`yarn at "${yarnPath}"`)
    return exec.exec(
        `"${yarnPath}" run test:e2e`,
        []
    )
  })
}

installDependancies()
.then(listPackages)
.then(runWpCypress)
.then(runTests)
.then(() => {
  core.debug('all done, exiting')
  // force exit to avoid waiting for child processes,
  // like the server we have started
  // see https://github.com/actions/toolkit/issues/216
  process.exit(0)
})
.catch(error => {
  console.log(error)
  core.setFailed(error.message)
  process.exit(1)
})
