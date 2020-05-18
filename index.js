// @ts-check
const core = require('@actions/core')
const exec = require('@actions/exec')
const io = require('@actions/io')
const quote = require('quote')

const installDependancies = () => {
  core.debug('installing NPM dependencies using Yarn')
  return io.which('yarn', true).then(yarnPath => {
    core.debug(`yarn at "${yarnPath}"`)
    return exec.exec(
        `"${yarnPath}" install --frozen-lockfile`,
        [])
  })
}

const runWpCypress = () => {
  core.debug('Create WP-Cypress docker container')
  return io.which('yarn', true).then(yarnPath => {
    return exec.exec(
        `"${yarnPath}" run wp-cypress start`,
        []
    )
  })
}

const runTests = () => {
  const commandPrefix = core.getInput('command-prefix')
  let cmd = []

  // we need to split the command prefix into individual arguments
  if (commandPrefix) {
    // otherwise they are passed all as a single string
    const parts = commandPrefix.split(' ')
    cmd = cmd.concat(parts)
    core.debug(`with concatenated command prefix: ${cmd.join(' ')}`)
  }
  const script = core.getInput('command')

  if (script) {
    cmd.push(script)
  }

  core.debug('runs cypress tests')
  return io.which('yarn', true).then(yarnPath => {
    core.debug(`yarn at "${yarnPath}"`)
    return exec.exec(
        `"${yarnPath}"`,
        cmd
    )
  })
}

installDependancies()
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
