const parse = text => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
const prop = element =>
  element.matches('input, textarea, select') ? 'value' : 'textContent'

class Rute {
  constructor(root = undefined) {
    this.root = root
    this.conversions = {
      test: content => {
        return content
      }
    }
    this.observers = {}
    this.computed = {}
    this.computedObservers = {}
    this._tmpElement = null
    this._globals = new Set()
    if (document.readyState !== 'loading') this.setup()
  }
  setup() {
    this.root ??=
      document.querySelector('rute') ??
      document.getElementById('rute') ??
      document.body
    const attr = name => this.root.getAttribute?.(name)
    this.default ??= attr('default') ?? 'index'
    this.dir ??= attr('dir') ?? 'templates/'
    this.ext ??= attr('ext') ?? '.html'
    this.page404 ??= attr('404')
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
    const previous = this._tmpElement
    this._tmpElement = element
    try {
      element.textContent = (0, eval)(this.computed[element.dataset.compute])
    } catch (error) {
      console.error(error)
    }
    this._tmpElement = previous
  }
  createComputed(elements) {
    for (const element of elements) {
      this.computed[element.dataset.compute] = element.textContent
      this.render(element)
    }
  }
  reactive(name, element) {
    if (!this.observers[name]) this.observers[name] = new Set()
    this.observers[name].add(element)
    const key = this.hashKey(name)
    if (globalThis.localStorage.getItem(key) === null) {
      this.setStored(key, parse(element[prop(element)]))
    }
    element[prop(element)] = this.getStored(key)
    if (this._globals.has(name)) return
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
    this.setup()
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

if (document.readyState === 'loading') {
  globalThis.addEventListener('DOMContentLoaded', onRouteChange)
} else {
  onRouteChange()
}
globalThis.addEventListener('hashchange', onRouteChange)

globalThis.addEventListener('input', event => {
  if (event.target.dataset.bind === undefined) return
  globalThis[event.target.dataset.bind] = event.target.value
})
