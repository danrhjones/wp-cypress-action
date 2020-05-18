// @ts-check
import {exec} from '@actions/exec'
import {which} from '@actions/io'
import {debug, warning, info, getInput, setFailed} from "@actions/core";
import {create, UploadOptions} from '@actions/artifact'
import {Inputs, getDefaultArtifactName} from './constants'
import {findFilesToUpload} from './search'


const installDependancies = () => {
  debug('installing NPM dependencies using Yarn')
  return which('yarn', true).then(yarnPath => {
    debug(`yarn at "${yarnPath}"`)
    return exec.exec(
        `"${yarnPath}" install --frozen-lockfile`,
        [])
  })
}

const runWpCypress = () => {
  debug('Create WP-Cypress docker container')
  return which('yarn', true).then(yarnPath => {
    return exec.exec(
        `"${yarnPath}" run wp-cypress start`,
        []
    )
  })
}

const runTests = () => {
  // const commandPrefix = getInput('command-prefix')
  // let cmd = []
  //
  // // we need to split the command prefix into individual arguments
  // if (commandPrefix) {
  //   // otherwise they are passed all as a single string
  //   const parts = commandPrefix.split(' ')
  //   cmd = cmd.concat(parts)
  //   debug(`with concatenated command prefix: ${cmd.join(' ')}`)
  // }
  // const script = getInput('command')
  //
  // if (script) {
  //   cmd.push(script)
  // }

  const cmd = getInput(Inputs.Command)

  debug('runs cypress tests')
  return which('yarn', true).then(yarnPath => {
    debug(`yarn at "${yarnPath}"`)
    return exec.exec(
        `"${yarnPath}"`,
        cmd
    )
  })
}

const uploadArtifacts = async () => {
  try {
    const name = getInput(Inputs.Name, {required: false})
    const path = getInput(Inputs.Path, {required: true})

    const searchResult = await findFilesToUpload(path)
    if (searchResult.filesToUpload.length === 0) {
      warning(
          `No files were found for the provided path: ${path}. No artifacts will be uploaded.`
      )
    } else {
      info(
          `With the provided path, there will be ${searchResult.filesToUpload.length} files uploaded`
      )
      debug(`Root artifact directory is ${searchResult.rootDirectory}`)

      const artifactClient = create()
      const options = {
        continueOnError: true
      }
      await artifactClient.uploadArtifact(
          name || getDefaultArtifactName(),
          searchResult.filesToUpload,
          searchResult.rootDirectory,
          options
      )

      core.info('Artifact upload has finished successfully!')
    }
  } catch (err) {
    core.setFailed(err.message)
  }
}

installDependancies()
.then(runWpCypress)
.then(runTests)
.then(uploadArtifacts)
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
