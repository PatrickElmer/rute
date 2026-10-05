// Indirect eval runs in global scope, so expressions can't see local variables
const evaluate = expr => (0, eval)(expr)

class Rute {
  constructor (root = undefined) {
    if (Rute._instance) return Rute._instance
    Rute._instance = this

    this.root =
      root ??
      document.querySelector('rute') ??
      document.getElementById('rute') ??
      document.body

    this.conversions = {
      test: content => {
        return content
      }
    }

    if (this.root.getAttributeNames) {
      this.default = this.root.getAttribute('default') ?? 'index'
      this.dir = this.root.getAttribute('dir') ?? 'templates/'
      this.ext = this.root.getAttribute('ext') ?? '.html'
      this.page404 = this.root.getAttribute('404')
    } else {
      this.default = 'index'
      this.dir = 'templates/'
      this.ext = '.html'
      this.page404 = undefined
    }

    this.observers = {}
    this.computed = {}
    this.computedObservers = {}
    this._tmpElement = null
    this._globals = new Set()
  }
  static isInvalidRoute (route) {
    return /^$|[%\\:?#\s]/.test(route) || route.split('/').includes('..')
  }
  get hash () {
    const route = globalThis.location.hash.substring(1).replace(/^\/+/, '')
    return Rute.isInvalidRoute(route) ? this.default : route
  }
  hashKey (name) {
    return `rute_hash_${this.hash}_${name}`
  }
  getStored (key) {
    const raw = globalThis.localStorage.getItem(key)
    if (raw === null) return null
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
  setStored (key, value) {
    if (value === undefined) globalThis.localStorage.removeItem(key)
    else globalThis.localStorage.setItem(key, JSON.stringify(value))
  }

  clear () {
    for (const key of Object.keys(globalThis.localStorage)) {
      if (key.startsWith('rute_')) globalThis.localStorage.removeItem(key)
    }
  }
  updateContent (content) {
    this.makeReactive(content.querySelectorAll('[data-bind]'))
    this.createComputed(content.querySelectorAll('[data-compute]'))
    this.root.replaceChildren(content)
    globalThis.scrollTo(0, 0)
  }
  createComputed (elements) {
    for (const element of elements) {
      this._tmpElement = element

      const name = element.dataset.compute
      this.computed[name] = element.textContent
      try {
        element.textContent = evaluate(element.textContent)
      } catch (error) {
        console.error(error)
      }
      this._tmpElement = null
    }
  }
  reactive (name, element) {
    if (!this.observers[name]) this.observers[name] = new Set()
    this.observers[name].add(element)

    const propertyName = element.value === undefined ? 'textContent' : 'value'
    const key = this.hashKey(name)

    let value = this.getStored(key)
    if (value === null) {
      try {
        value = JSON.parse(element[propertyName])
      } catch (error) {
        value = element[propertyName]
      }
      this.setStored(key, value)
      value = this.getStored(key)
    }
    element[propertyName] = value
    if (!this._globals.has(name)) {
      if (Object.hasOwn(globalThis, name)) {
        console.error(`rute: data-bind="${name}" clashes with an existing global`)
        return
      }
      this._globals.add(name)
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get: () => {
          if (this._tmpElement) {
            if (!this.computedObservers[name])
              this.computedObservers[name] = new Set()
            this.computedObservers[name].add(this._tmpElement)
          }
          return this.getStored(key)
        },
        set: value => {
          this.setStored(key, value)
          this.observers[name].forEach(
            element =>
              (element[element.value === undefined ? 'textContent' : 'value'] =
                value)
          )
          if (this.computedObservers[name] !== undefined) {
            for (let element of this.computedObservers[name]) {
              try {
                element.textContent = evaluate(
                  this.computed[element.dataset.compute]
                )
              } catch (error) {
                console.error(error)
              }
            }
          }
        }
      })
    }
  }
  makeReactive (elements) {
    for (const element of elements) {
      const name = element.dataset.bind
      this.reactive(name, element)
    }
  }
  reset () {
    for (const name of this._globals) {
      delete globalThis[name]
    }
    this._globals.clear()
    this.observers = {}
    this.computed = {}
    this.computedObservers = {}
  }
  async init () {
    this.reset()
    const fragment = document
      .createRange()
      .createContextualFragment(await this.content())
    this.updateContent(fragment)
  }
  async content () {
    let res
    try {
      res = await fetch(this.dir + this.hash + this.ext)
    } catch (error) {
      console.error(error)
      return this.page404 || '<h1>Network error</h1>'
    }
    if (!res.ok)
      return this.page404 || `<h1>${res.status}</h1><p>${res.statusText}</p>`
    let content = await res.text()
    Object.values(this.conversions).forEach(fn => {
      content = fn(content)
    })
    return content
  }
}

const rute = new Rute()

function ruteOnRouteChange () {
  rute.init()
}

globalThis.addEventListener('DOMContentLoaded', ruteOnRouteChange)
globalThis.addEventListener('hashchange', ruteOnRouteChange)

globalThis.addEventListener('input', event => {
    if (event.target.dataset.bind === undefined) return
    globalThis[event.target.dataset.bind] = event.target.value
})
