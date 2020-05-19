// @ts-check
import {exec} from '@actions/exec'
import {which} from '@actions/io'
import {
  debug,
  exportVariable,
  getInput,
  setFailed,
} from "@actions/core";
import * as os from "os";
import {restoreCache, saveCache} from 'cache/lib';
import {Octokit} from "@octokit/rest";
import hasha from "hasha";
const {Inputs} = require("cache/lib/constants");
const findYarnWorkspaceRoot = require('find-yarn-workspace-root')
const got = require('got')
const quote = require('quote')
const cliParser = require('argument-vector')()
const path = require('path')
const fs = require('fs')


/**
 * A small utility for checking when an URL responds, kind of
 * a poor man's https://www.npmjs.com/package/wait-on
 */
const ping = (url, timeout) => {
  const start = +new Date()
  return got(url, {
    retry: {
      retries(retry, error) {
        const now = +new Date()
        debug(
            `${now - start}ms ${error.method} ${error.host} ${
                error.code
            }`
        )
        if (now - start > timeout) {
          console.error('%s timed out', url)
          return 0
        }
        return 1000
      }
    }
  })
}

/**
 * Parses input command, finds the tool and
 * the runs the command.
 */
const execCommand = (
    fullCommand,
    waitToFinish = true,
    label = 'executing'
) => {
  const cwd = cypressCommandOptions.cwd

  console.log('%s with command "%s"', label, fullCommand)
  console.log('current working directory "%s"', cwd)

  const args = cliParser.parse(fullCommand)
  debug(`parsed command: ${args.join(' ')}`)

  return which(args[0], true).then(toolPath => {
    debug(`found command "${toolPath}"`)
    debug(`with arguments ${args.slice(1).join(' ')}`)

    const toolArguments = args.slice(1)
    const argsString = toolArguments.join(' ')
    debug(`running ${quote(toolPath)} ${argsString} in ${cwd}`)
    debug('without waiting for the promise to resolve')

    const promise = exec(
        quote(toolPath),
        toolArguments,
        cypressCommandOptions
    )
    if (waitToFinish) {
      return promise
    }
  })
}

const isWindows = () => os.platform() === 'win32'

const homeDirectory = os.homedir()
const platformAndArch = `${process.platform}-${process.arch}`

const workingDirectory =
    getInput('working-directory') || process.cwd()

/**
 * When running "npm install" or any other Cypress-related commands,
 * use the install directory as current working directory
 */
const cypressCommandOptions = {
  cwd: workingDirectory
}

const yarnFilename = path.join(
    findYarnWorkspaceRoot(workingDirectory) || workingDirectory,
    'yarn.lock'
)
const packageLockFilename = path.join(
    workingDirectory,
    'package-lock.json'
)

const useYarn = () => fs.existsSync(yarnFilename)

const lockHash = () => {
  const lockFilename = useYarn() ? yarnFilename : packageLockFilename
  return hasha.fromFileSync(lockFilename)
}

// enforce the same NPM cache folder across different operating systems
const NPM_CACHE_FOLDER = path.join(homeDirectory, '.npm')
const getNpmCache = () => {
  const o = {}
  let key = getInput('cache-key')
  const hash = lockHash()
  if (!key) {
    if (useYarn()) {
      key = `yarn-${platformAndArch}-${hash}`
    } else {
      key = `npm-${platformAndArch}-${hash}`
    }
  } else {
    console.log('using custom cache key "%s"', key)
  }

  if (useYarn()) {
    o.inputPath = path.join(homeDirectory, '.cache', 'yarn')
  } else {
    o.inputPath = NPM_CACHE_FOLDER
  }

  o.restoreKeys = o.primaryKey = key
  return o
}

// custom Cypress binary cache folder
// see https://on.cypress.io/caching
const CYPRESS_CACHE_FOLDER = path.join(
    homeDirectory,
    '.cache',
    'Cypress'
)
debug(
    `using custom Cypress cache folder "${CYPRESS_CACHE_FOLDER}"`
)

const getCypressBinaryCache = () => {
  const o = {
    inputPath: CYPRESS_CACHE_FOLDER,
    restoreKeys: `cypress-${platformAndArch}-`
  }
  o.primaryKey = o.restoreKeys + lockHash()
  return o
}

const restoreCachedNpm = () => {
  debug('trying to restore cached NPM modules')
  const NPM_CACHE = getNpmCache()
  return restoreCache(
      NPM_CACHE.inputPath,
      NPM_CACHE.primaryKey,
      NPM_CACHE.restoreKeys
  )
}

const saveCachedNpm = () => {
  debug('saving NPM modules')
  const NPM_CACHE = getNpmCache()
  return saveCache(NPM_CACHE.inputPath, NPM_CACHE.primaryKey)
}

const restoreCachedCypressBinary = () => {
  debug('trying to restore cached Cypress binary')
  const CYPRESS_BINARY_CACHE = getCypressBinaryCache()
  return restoreCache(
      CYPRESS_BINARY_CACHE.inputPath,
      CYPRESS_BINARY_CACHE.primaryKey,
      CYPRESS_BINARY_CACHE.restoreKeys
  )
}

const saveCachedCypressBinary = () => {
  debug('saving Cypress binary')
  const CYPRESS_BINARY_CACHE = getCypressBinaryCache()
  return saveCache(
      CYPRESS_BINARY_CACHE.inputPath,
      CYPRESS_BINARY_CACHE.primaryKey
  )
}

const install = () => {
  // prevent lots of progress messages during install
  exportVariable('CI', '1')
  exportVariable('CYPRESS_CACHE_FOLDER', CYPRESS_CACHE_FOLDER)

  // Note: need to quote found tool to avoid Windows choking on
  // npm paths with spaces like "C:\Program Files\nodejs\npm.cmd ci"

  if (useYarn()) {
    debug('installing NPM dependencies using Yarn')
    return which('yarn', true).then(yarnPath => {
      debug(`yarn at "${yarnPath}"`)
      return exec(
          quote(yarnPath),
          ['--frozen-lockfile'],
          cypressCommandOptions
      )
    })
  } else {
    debug('installing NPM dependencies')
    exportVariable('npm_config_cache', NPM_CACHE_FOLDER)

    return which('npm', true).then(npmPath => {
      debug(`npm at "${npmPath}"`)
      return exec(quote(npmPath), ['ci'], cypressCommandOptions)
    })
  }
}

const verifyCypressBinary = () => {
  debug('Verifying Cypress')
  exportVariable('CYPRESS_CACHE_FOLDER', CYPRESS_CACHE_FOLDER)
  return which('npx', true).then(npxPath => {
    return exec(
        quote(npxPath),
        ['cypress', 'verify'],
        cypressCommandOptions
    )
  })
}

/**
 * Grabs a boolean GitHub Action parameter input and casts it.
 * @param {string} name - parameter name
 * @param {boolean} defaultValue - default value to use if the parameter was not specified
 * @returns {boolean} converted input argument or default value
 */
const getInputBool = (name, defaultValue = false) => {
  const param = getInput(name)
  if (param === 'true' || param === '1') {
    return true
  }
  if (param === 'false' || param === '0') {
    return false
  }

  return defaultValue
}

const buildAppMaybe = () => {
  const buildApp = getInput('build')
  if (!buildApp) {
    return
  }

  debug(`building application using "${buildApp}"`)

  return execCommand(buildApp, true, 'build app')
}

const startServerMaybe = () => {
  let startCommand

  if (isWindows()) {
    // allow custom Windows start command
    startCommand =
        getInput('start-windows') || getInput('start')
  } else {
    startCommand = getInput('start')
  }
  if (!startCommand) {
    debug('No start command found')
    return
  }

  return execCommand(startCommand, false, 'start server')
}

const waitOnMaybe = () => {
  const waitOn = getInput('wait-on')
  if (!waitOn) {
    return
  }

  const waitOnTimeout = getInput('wait-on-timeout') || '60'

  console.log(
      'waiting on "%s" with timeout of %s seconds',
      waitOn,
      waitOnTimeout
  )

  const waitTimeoutMs = parseFloat(waitOnTimeout) * 1000

  return ping(waitOn, waitTimeoutMs)
}

const I = x => x

const runTests = async () => {
  const runTests = getInputBool('runTests', true)
  if (!runTests) {
    console.log('Skipping running tests: runTests parameter is false')
    return
  }

  // export common environment variables that help run Cypress
  exportVariable('CYPRESS_CACHE_FOLDER', CYPRESS_CACHE_FOLDER)
  exportVariable('TERM', 'xterm')

  const customCommand = getInput('command')
  if (customCommand) {
    console.log('Using custom test command: %s', customCommand)
    return execCommand(customCommand, true, 'run tests')
  }

  debug('Running Cypress tests')
  const quoteArgument = isWindows() ? quote : I

  const commandPrefix = getInput('command-prefix')
  const record = getInputBool('record')
  const parallel = getInputBool('parallel')
  const headless = getInputBool('headless')

  // TODO using yarn to run cypress when yarn is used for install
  // split potentially long

  let cmd = []
  if (commandPrefix) {
    // we need to split the command prefix into individual arguments
    // otherwise they are passed all as a single string
    const parts = commandPrefix.split(' ')
    cmd = cmd.concat(parts)
    debug(`with concatenated command prefix: ${cmd.join(' ')}`)
  }
  // push each CLI argument separately
  cmd.push('cypress')
  cmd.push('run')
  if (headless) {
    cmd.push('--headless')
  }
  if (record) {
    cmd.push('--record')
  }
  if (parallel) {
    cmd.push('--parallel')
  }
  const group = getInput('group')
  if (group) {
    cmd.push('--group')
    cmd.push(quoteArgument(group))
  }
  const tag = getInput('tag')
  if (tag) {
    cmd.push('--tag')
    cmd.push(quoteArgument(tag))
  }
  const configInput = getInput('config')
  if (configInput) {
    cmd.push('--config')
    cmd.push(quoteArgument(configInput))
  }
  const spec = getInput('spec')
  if (spec) {
    cmd.push('--spec')
    cmd.push(quoteArgument(spec))
  }
  const configFileInput = getInput('config-file')
  if (configFileInput) {
    cmd.push('--config-file')
    cmd.push(quoteArgument(configFileInput))
  }
  if (parallel || group) {
    const {
      GITHUB_WORKFLOW,
      GITHUB_SHA,
      GITHUB_TOKEN,
      GITHUB_RUN_ID,
      GITHUB_REPOSITORY
    } = process.env

    const [owner, repo] = GITHUB_REPOSITORY.split('/')
    let parallelId = `${GITHUB_WORKFLOW} - ${GITHUB_SHA}`

    if (GITHUB_TOKEN) {
      const client = new Octokit({
        auth: GITHUB_TOKEN
      })

      const resp = await client.request(
          'GET /repos/:owner/:repo/actions/runs/:run_id',
          {
            owner,
            repo,
            run_id: GITHUB_RUN_ID
          }
      )

      if (resp && resp.data) {
        exportVariable('GH_BRANCH', resp.data.head_branch)
      }

      const runsList = await client.request(
          'GET /repos/:owner/:repo/actions/runs/:run_id/jobs',
          {
            owner,
            repo,
            run_id: GITHUB_RUN_ID
          }
      )

      if (runsList && runsList.data) {
        // Use the total_count, every time a job is restarted the list has
        // the number of jobs including current run and previous runs, every time
        // it appends the result.
        parallelId = `${GITHUB_RUN_ID}-${runsList.data.total_count}`
      }
    }

    const customCiBuildId = getInput('ci-build-id') || parallelId
    cmd.push('--ci-build-id')
    cmd.push(quoteArgument(customCiBuildId))
  }

  const browser = getInput('browser')
  if (browser) {
    cmd.push('--browser')
    // TODO should browser be quoted?
    // If it is a path, it might have spaces
    cmd.push(browser)
  }

  const envInput = getInput('env')
  if (envInput) {
    // TODO should env be quoted?
    // If it is a JSON, it might have spaces
    cmd.push('--env')
    cmd.push(envInput)
  }

  console.log('Cypress test command: npx %s', cmd.join(' '))

  // since we have quoted arguments ourselves, do not double quote them
  const opts = {
    ...cypressCommandOptions,
    windowsVerbatimArguments: false
  }

  debug(`in working directory "${cypressCommandOptions.cwd}"`)

  const npxPath = await which('npx', true)
  debug(`npx path: ${npxPath}`)

  return exec(quote(npxPath), cmd, opts)
}

const installMaybe = () => {
  const installParameter = getInputBool('install', true)
  if (!installParameter) {
    console.log('Skipping install because install parameter is false')
    return Promise.resolve()
  }

  return Promise.all([
    restoreCachedNpm(),
    restoreCachedCypressBinary()
  ]).then(([npmCacheHit, cypressCacheHit]) => {
    debug(`npm cache hit ${npmCacheHit}`)
    debug(`cypress cache hit ${cypressCacheHit}`)

    return install().then(() => {
      if (npmCacheHit && cypressCacheHit) {
        debug('no need to verify Cypress binary or save caches')
        return
      }

      return verifyCypressBinary()
      .then(saveCachedNpm)
      .then(saveCachedCypressBinary)
    })
  })
}

const runWpCypress = () => {
  debug('Create WP-Cypress docker container')
  if (useYarn()) {
    return which('yarn', true).then(yarnPath => {
      return exec(
          `"${yarnPath}" run wp-cypress start`,
          []
      )
    })
  } else {
    return which('npm', true).then(npmPath => {
      debug(`npm at "${npmPath}"`)
      return exec(`${npmPath}" run wp-cypress start`, [])
    })
  }
}


installMaybe()
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
