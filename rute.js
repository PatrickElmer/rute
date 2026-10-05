const parse = text => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
const prop = element => (element.value === undefined ? 'textContent' : 'value')

class Rute {
  constructor(root = undefined) {
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
  static isInvalidRoute(route) {
    return /^$|[%\\:?#\s]/.test(route) || route.split('/').includes('..')
  }
  get hash() {
    const route = globalThis.location.hash.substring(1).replace(/^\/+/, '')
    return Rute.isInvalidRoute(route) ? this.default : route
  }
  hashKey(name) {
    return `rute_hash_${this.hash}_${name}`
  }
  getStored(key) {
    return parse(globalThis.localStorage.getItem(key))
  }
  setStored(key, value) {
    if (value === undefined) globalThis.localStorage.removeItem(key)
    else globalThis.localStorage.setItem(key, JSON.stringify(value))
  }

  clear() {
    for (const key of Object.keys(globalThis.localStorage)) {
      if (key.startsWith('rute_')) globalThis.localStorage.removeItem(key)
    }
  }
  updateContent(content) {
    content
      .querySelectorAll('[data-bind]')
      .forEach(element => this.reactive(element.dataset.bind, element))
    this.createComputed(content.querySelectorAll('[data-compute]'))
    this.root.replaceChildren(content)
    globalThis.scrollTo(0, 0)
  }
  render(element) {
    try {
      element.textContent = (0, eval)(this.computed[element.dataset.compute])
    } catch (error) {
      console.error(error)
    }
  }
  createComputed(elements) {
    for (const element of elements) {
      this._tmpElement = element
      this.computed[element.dataset.compute] = element.textContent
      this.render(element)
      this._tmpElement = null
    }
  }
  reactive(name, element) {
    if (!this.observers[name]) this.observers[name] = new Set()
    this.observers[name].add(element)

    const key = this.hashKey(name)
    if (this.getStored(key) === null) {
      this.setStored(key, parse(element[prop(element)]))
    }
    element[prop(element)] = this.getStored(key)
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
            element => (element[prop(element)] = value)
          )
          this.computedObservers[name]?.forEach(element => this.render(element))
        }
      })
    }
  }
  reset() {
    for (const name of this._globals) {
      delete globalThis[name]
    }
    this._globals.clear()
    this.observers = {}
    this.computed = {}
    this.computedObservers = {}
  }
  async init() {
    this.reset()
    const fragment = document
      .createRange()
      .createContextualFragment(await this.content())
    this.updateContent(fragment)
  }
  async content() {
    const url = this.dir + this.hash + this.ext
    const res = await fetch(url).catch(console.error)
    if (!res) return this.page404 || '<h1>Network error</h1>'
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
const onRouteChange = () => rute.init()

globalThis.addEventListener('DOMContentLoaded', onRouteChange)
globalThis.addEventListener('hashchange', onRouteChange)

globalThis.addEventListener('input', event => {
  if (event.target.dataset.bind === undefined) return
  globalThis[event.target.dataset.bind] = event.target.value
})
