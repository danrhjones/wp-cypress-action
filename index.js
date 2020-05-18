// @ts-check
import {exec} from '@actions/exec'
import {which} from '@actions/io'
import {debug, getInput, setFailed} from "@actions/core";


const installDependancies = () => {
  debug('installing NPM dependencies using Yarn')
  return which('yarn', true).then(yarnPath => {
    debug(`yarn at "${yarnPath}"`)
    return exec(
        `"${yarnPath}" install --frozen-lockfile`,
        [])
  })
}

const runWpCypress = () => {
  debug('Create WP-Cypress docker container')
  return which('yarn', true).then(yarnPath => {
    return exec(
        `"${yarnPath}" run wp-cypress start`,
        []
    )
  })
}

const runTests = () => {
  const commandPrefix = getInput('command-prefix')
  let cmd = []

  // we need to split the command prefix into individual arguments
  if (commandPrefix) {
    // otherwise they are passed all as a single string
    const parts = commandPrefix.split(' ')
    cmd = cmd.concat(parts)
    debug(`with concatenated command prefix: ${cmd.join(' ')}`)
  }
  const script = getInput('command')

  if (script) {
    cmd.push(script)
  }

  // const cmd = getInput(Inputs.Command)

  debug('runs cypress tests')
  return which('yarn', true).then(yarnPath => {
    debug(`yarn at "${yarnPath}"`)
    return exec(
        `"${yarnPath}"`,
        cmd
    )
  })
}


installDependancies()
.then(runWpCypress)
.then(runTests)
.then(() => {
  debug('all done, exiting')
  // force exit to avoid waiting for child processes,
  // like the server we have started
  // see https://github.com/actions/toolkit/issues/216
  process.exit(0)
})
.catch(error => {
  console.log(error)
  setFailed(error.message)
  process.exit(1)
})
