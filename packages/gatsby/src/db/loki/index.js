const _ = require(`lodash`)
const fs = require(`fs-extra`)
const path = require(`path`)
const loki = require(`lokijs`)
const uuidv4 = require(`uuid/v4`)
const customComparators = require(`./custom-comparators`)

// Ensure sorting behavior matches old lodash `orderBy`
// implementation. See `custom-comparators.js` for why.
loki.Comparators.lt = customComparators.ltHelper
loki.Comparators.gt = customComparators.gtHelper

// Loki is a document store with the same semantics as mongo. This
// means there are no tables or relationships. Just a bunch of
// collections, each with objects.
//
// Gatsby stores nodes in collections by splitting them up by their
// `node.internal.type`. All nodes of a particular type go in 1
// collection. The below `colls` object contains the metadata for
// these collections, and the "meta collections" used to track them.
//
// You won't use these directly. They are used by the collection
// functions in `./nodes.js`. E.g `getTypeCollName()` and
// `getNodeTypeCollection`
const colls = {
  // Each object has keys `id` and `typeCollName`. It's a way of
  // quickly looking up the collection that a node is contained in.
  // E.g { id: `someNodeId`, typeCollName: `gatsby:nodeType:myType` }
  nodeMeta: {
    name: `gatsby:nodeMeta`,
    options: {
      unique: [`id`],
      indices: [`id`],
    },
  },
  // The list of all node type collections. Each object has keys
  // `type` and `collName` so you can quickly look up the collection
  // name for a node type.
  // e.g { type: `myType`, collName: `gatsby:nodeType:myType` }
  nodeTypes: {
    name: `gatsby:nodeTypes`,
    options: {
      unique: [`type`, `collName`],
      indices: [`type`],
    },
  },
}

// Must be set using `start()`
let db

/**
 * Ensures that the collections that support nodes have been
 * created. See `colls` var in this file
 */
function ensureNodeCollections(db) {
  _.forEach(colls, collInfo => {
    const { name, options } = collInfo
    db.addCollection(name, options)
  })
}

function startFileDb(saveFile) {
  return new Promise((resolve, reject) => {
    const dbOptions = {
      autoload: true,
      autoloadCallback: err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      },
    }
    db = new loki(saveFile, dbOptions)
  })
}

async function startInMemory() {
  // Use uuid purely for a random name
  db = new loki(uuidv4())
}

/**
 * Starts a loki database. If the file already exists, it will be
 * loaded as the database state. If not, a new database will be
 * created. If `saveFile` is omitted, an in-memory DB will be created.
 *
 * @param {string} saveFile on disk file that the database will be
 * saved and loaded from. If this is omitted, an in-memory database
 * will be created instead
 * @returns {Promise} promise that is resolved once the database and
 * the existing state has been loaded (if there was an existing
 * saveFile)
 */
async function start({ saveFile } = {}) {
  if (saveFile && !_.isString(saveFile)) {
    throw new Error(`saveFile must be a path`)
  }
  if (saveFile) {
    const saveDir = path.dirname(saveFile)
    await fs.ensureDir(saveDir)
    await startFileDb(saveFile)
  } else {
    await startInMemory()
  }
  ensureNodeCollections(db)
}

// Saves the database to disk and returns a promise that will be
// resolved once the save has finished
function saveState() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.saveDatabase(err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    } else {
      reject(`No database found.`)
    }
  })
}

/**
 * Returns a reference to the database. If undefined, the db has not been
 * initialized yet. Call `start()`
 *
 * @returns {Object} database, or undefined
 */
function getDb() {
  return db
}

module.exports = {
  start,
  getDb,
  colls,
  saveState,
}
