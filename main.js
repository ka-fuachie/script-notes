// TODO: Cache block code functions
let blockTemplate = document.querySelector("template[data-block-template]")

function* idGeneratorFactory () {
  let id = 0;
  while(true) yield id++
}

let RUNNING_BLOCK = null
let blockIdGenerator = idGeneratorFactory()
let getNextBlockId = () => blockIdGenerator.next().value

function addBlock() {
  let block = blockTemplate.content.cloneNode(true)
  let blockId = getNextBlockId()
  block.querySelector("[data-block]").dataset.block = blockId
  $$SCOPE[BLOCKS].set(blockId, { id: blockId, values: new Set() })
  document.body.insertBefore(block, document.querySelector("[data-action='add']"))
}

document.body.addEventListener("click", ev => {
  if(ev.target.matches("[data-action='add']")) {
    addBlock()
  }

  if(ev.target.matches("[data-action='run']")) {
    let block = ev.target.closest("[data-block]"),
        blockId = Number(block.dataset.block),
        editor = ev.target.nextElementSibling,
        code = editor.value
    
    console.log("RUN", blockId)
    RUNNING_BLOCK = $$SCOPE[BLOCKS].get(blockId)
    try {
      new Function(`with(this) { ${code} }`).call($$SCOPE)
    } catch(err) {
      console.error(err)
    } finally {
      RUNNING_BLOCK = null
    }
  }

  if(ev.target.matches("[data-action='delete']")) {
    let blockEl = ev.target.closest("[data-block]"),
        blockId = Number(blockEl.dataset.block)
    
    console.log("DELETE", blockId)
    let block = $$SCOPE[BLOCKS].get(blockId)
    for(let value of block.values) {
      $$SCOPE[VALUES].delete(value.name)
    }
    $$SCOPE[BLOCKS].delete(blockId)
    blockEl.remove()
  }
})

const VALUES = Symbol("VALUES")
const BLOCKS = Symbol("BLOCKS")

let $$SCOPE = new Proxy({
  [VALUES]: new Map(),
  [BLOCKS]: new Map(),
}, {
  has(target, key) {
    return !(key in globalThis)
  },
  get(target, key) {
    if(key === "$$SCOPE") return Reflect.get(target, key)
    if(typeof key !== "string") return Reflect.get(target, key)

    if(RUNNING_BLOCK == null) throw new Error("Cannot use scope outside of a block")

    if(key.startsWith("$")) {
      return getReactive.call(target, key.slice(1))
    } else {
      return getVariable.call(target, key)
    }
  },
  set(target, key, value) {
    if(key === "$$SCOPE") {
      if(Reflect.has(target, key)) throw new Error("Cannot reassign $$SCOPE")
      return Reflect.set(target, key, value)
    }

    if(RUNNING_BLOCK == null) throw new Error("Cannot use scope outside of a block")

    if(key.startsWith("$")) {
      if(target[VALUES].has(key.slice(1))) return setReactive.call(target, key.slice(1), value)
      else return createReactive.call(target, key.slice(1), value)
    } else {
      if(target[VALUES].has(key)) return setVariable.call(target, key, value)
      else return createVariable.call(target, key, value)
    }
  }
})
$$SCOPE.$$SCOPE = $$SCOPE

function createReactive(name, value) {
  if(this[VALUES].has(name)) throw new Error(`"${name}" is already defined as a variable`)
  let entry = {
    name,
    value,
    reactive: true,
    block: RUNNING_BLOCK,
  }
  this[VALUES].set(name, entry)
  RUNNING_BLOCK.values.add(entry)
}

function getReactive(name) {
  if(!this[VALUES].has(name)) throw new Error(`"${name}" is not defined`)
  if(!this[VALUES].get(name).reactive) throw new Error(`"${name}" is not a reactive`)
  // TODO: register dependency
  return this[VALUES].get(name).value
}

function setReactive(name, value) {
  if(this[VALUES].get(name).block !== RUNNING_BLOCK) {
    throw new Error(`Reactive "${name}" is already defined in block ${this[VALUES].get(name).block.id}`)
  }

  this[VALUES].get(name).value = value
  // TODO: trigger updates
}

function createVariable(name, value) {
  let entry = {
    name,
    value,
    reactive: false,
  }
  this[VALUES].set(name, entry)
}

function getVariable(name) {
  if(!this[VALUES].has(name)) throw new Error(`"${name}" is not defined`)
  return this[VALUES].get(name).value
}

function setVariable(name, value) {
  if(this[VALUES].get(name).reactive) {
    throw new Error(`Reactive "${name}" is already defined in block ${this[VALUES].get(name).block.id}`)
  }
  this[VALUES].get(name).value = value
}
