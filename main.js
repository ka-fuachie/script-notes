// TODO: Cache block code functions
let blockTemplate = document.querySelector("template[data-block-template]")

class NotebookScope {
  static VARIABLES = Symbol("NotebookScope.VARIABLES")
  static BLOCKS = Symbol("NotebookScope.BLOCKS")
  static RUNNING_BLOCK = Symbol("NotebookScope.RUNNING_BLOCK")

  /** @type {ProxyHandler<NotebookScope>} */
  static get proxyHandler() {
    return {
      has(target, key) {
        return !(key in globalThis)
      },
      get(target, key) {
        if(target[NotebookScope.RUNNING_BLOCK] == null) return Reflect.get(target, key)
        if(typeof key !== "string" || key === "$$SCOPE") return Reflect.get(target, key)


        if(key.startsWith("$")) {
          return target.getReactive(key.slice(1))
        } else {
          return target.getVariable(key)
        }
      },
      set(target, key, value) {
        if(key === "$$SCOPE" && Reflect.has(target, "$$SCOPE")) throw new TypeError("Illegal assignment of $$SCOPE")

        if(target[NotebookScope.RUNNING_BLOCK] == null) return Reflect.set(target, key, value)
        if(typeof key !== "string") return Reflect.set(target, key, value)

        if(key.startsWith("$")) {
          return target.setReactive(key.slice(1), value)
        } else {
          return target.setVariable(key, value)
        }
      },
      deleteProperty(target, key) {
        if(key === "$$SCOPE") throw new TypeError("Illegal deletion of $$SCOPE")
        if(typeof key !== "string") return Reflect.deleteProperty(target, key)

        if(key.startsWith("$")) {
          return target.deleteReactive(key.slice(1))
        } else {
          return target.deleteVariable(key)
        }
      }
    }
  }

  static create() {
    let scope = new Proxy(new NotebookScope(), NotebookScope.proxyHandler)
    scope.$$SCOPE = scope
    return scope
  }

  static BlockIdGenerator = idGeneratorFactory()
  static getNextBlockId() {
    return NotebookScope.BlockIdGenerator.next().value
  }

  constructor() {
    /** @type Map<string, Variable | Reactive> */
    this[NotebookScope.VARIABLES] = new Map()
    /** @type Map<number, Block> */
    this[NotebookScope.BLOCKS] = new Map()
    /** @type {Block | null} */
    this[NotebookScope.RUNNING_BLOCK] = null
  }

  createVariable(name, value) {
    let variable = {
      name,
      value,
      reactive: false,
    }
    this[NotebookScope.VARIABLES].set(name, variable)
  }

  getVariable(name) {
    if(!this[NotebookScope.VARIABLES].has(name)) throw new ReferenceError(`${name} is not defined`)
    return this[NotebookScope.VARIABLES].get(name).value
  }

  setVariable(name, value) {
    if(!this[NotebookScope.VARIABLES].has(name)) return this.createVariable(name, value)
    
    let variable = this[NotebookScope.VARIABLES].get(name)
    if(variable.reactive) {
      throw new TypeError(`Illegal assignment to reactive ${name} defined in block ${variable.owner.id}`)
    }
    variable.value = value
  }

  deleteVariable(name) {
    if(!this[NotebookScope.VARIABLES].has(name)) return
    if(variable.reactive) {
      throw new TypeError(`Illegal deletion of reactive ${name} as a variable`)
    }
    this[NotebookScope.VARIABLES].delete(name)
  }

  createReactive(name, value) {
    if(this[NotebookScope.VARIABLES].has(name)) throw new TypeError(`${name} is already defined as a variable`)
    let variable = {
      name,
      value,
      reactive: true,
      owner: this[NotebookScope.RUNNING_BLOCK]
    }
    this[NotebookScope.VARIABLES].set(name, variable)
    this[NotebookScope.RUNNING_BLOCK].owned.add(variable)
  }

  getReactive(name) {
    if(!this[NotebookScope.VARIABLES].has(name)) throw new ReferenceError(`${name} is not defined`)

    let variable = this[NotebookScope.VARIABLES].get(name)
    if(!variable.reactive) throw new TypeError(`Illegal reactive access to a non reactive variable ${name}`)
    // TODO: register dependency
    return variable.value
  }

  setReactive(name, value) {
    if(!this[NotebookScope.VARIABLES].has(name)) return this.createReactive(name, value)
    
    let variable = this[NotebookScope.VARIABLES].get(name)
    if(!variable.reactive) throw new TypeError(`Illegal reactive assignment to a non reactive variable ${name}`)
    if(variable.owner !== this[NotebookScope.RUNNING_BLOCK]) {
      throw new TypeError(`Illegal assignment to reactive ${name} defined in block ${variable.owner.id}`)
    }

    this[NotebookScope.VARIABLES].get(name).value = value
    // TODO: trigger updates
  }

  deleteReactive(name) {
    if(!this[NotebookScope.VARIABLES].has(name)) return

    let variable = this[NotebookScope.VARIABLES].get(name)
    if(!variable.reactive) throw new TypeError(`Illegal reactive deletion of a non reactive variable ${name}`)
    this[NotebookScope.VARIABLES].delete(name)

    // TODO: trigger updates
  }

  addBlock() {
    let block = blockTemplate.content.cloneNode(true)
    let blockId = NotebookScope.getNextBlockId()
    block.querySelector("[data-block]").dataset.block = blockId
    this[NotebookScope.BLOCKS].set(blockId, { id: blockId, owned: new Set() })
    document.body.insertBefore(block, document.querySelector("[data-action='add']"))
  }

  runBlock(id) {
    let block = document.querySelector(`[data-block="${id}"]`),
        editor = block.querySelector("textarea"),
        code = editor.value
    
    this[NotebookScope.RUNNING_BLOCK] = this[NotebookScope.BLOCKS].get(id)
    try {
      new Function(`with(this) { ${code} }`).call($$SCOPE)
    } catch(err) {
      console.error(err)
    } finally {
      this[NotebookScope.RUNNING_BLOCK] = null
    }
  }

  deleteBlock(id) {
    let block = this[BLOCKS].get(id)
    for(let value of block.owned) {
      deleteReactive(value.name)
    }
    this[BLOCKS].delete(id)
    document.querySelector(`[data-block="${id}"]`).remove()
  }
}

/**
  * @typedef {Object} Variable
  * @property {string} name
  * @property {*} value
  * @property {false} reactive
  */

/**
  * @typedef {Object} Reactive
  * @property {string} name
  * @property {*} value
  * @property {true} reactive
  * @property {*} owner
  */

/**
  * @typedef {Object} Block
  * @property {number} id
  * @property {Set<Reactive>} owned
  */
function* idGeneratorFactory () {
  let id = 0;
  while(true) yield id++
}

let $$SCOPE = NotebookScope.create()
document.body.addEventListener("click", ev => {
  if(ev.target.matches("[data-action='add']")) {
    $$SCOPE.addBlock()
  }

  if(ev.target.matches("[data-action='run']")) {
    let block = ev.target.closest("[data-block]"),
        blockId = Number(block.dataset.block)
    
    console.log("RUN", blockId)
    $$SCOPE.runBlock(blockId)
  }

  if(ev.target.matches("[data-action='delete']")) {
    let blockEl = ev.target.closest("[data-block]"),
        blockId = Number(blockEl.dataset.block)
    
    console.log("DELETE", blockId)
    $$SCOPE.deleteBlock(blockId)
  }
})
