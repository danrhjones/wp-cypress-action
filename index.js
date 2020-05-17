// @ts-check
const core = require('@actions/core')
const exec = require('@actions/exec')
const io = require('@actions/io')
const quote = require('quote')

const blah = () => {

    console.log('in blah')
    core.debug('installing NPM dependencies using Yarn')
    return io.which('yarn', true).then(yarnPath => {
      core.debug(`yarn at "${yarnPath}"`)
      return exec.exec(
          quote(yarnPath),
          ['--frozen-lockfile'],
          // cypressCommandOptions
      )
    })
}

const runWpCypress = () => {
  console.log('In runWpCypress')
  // const customCommand = 'yarn'

  // console.log('Using: ', customCommand)
  // return execCommand(customCommand, true, 'run wp-cypress start')

    console.log('yarn list')
     io.which('yarn', true).then(yarnPath => {
      core.debug(`yarn at "${yarnPath}"`)
       exec.exec(
          quote(yarnPath),
          ['list --depth=0'],
          // cypressCommandOptions
      )
    })

    console.log('start cypress')
    return io.which('yarn', true).then(yarnPath => {
      core.debug(`yarn at "${yarnPath}"`)
      return exec.exec(
          quote(yarnPath),
          ['run wp-cypress start'],
          // cypressCommandOptions
      )
    })
}

blah()
.then(runWpCypress)
.then(() => {
  console.log('starting blah')
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
