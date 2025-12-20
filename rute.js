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
      this.page_404 = this.root.getAttribute('404')
    } else {
      this.default = 'index'
      this.dir = 'templates/'
      this.ext = '.html'
      this.page_404 = undefined
    }

    this.observers = {}
    this.computed = {}
    this.computedObservers = {}
    this._tmpElement = null

    // Debugging
    // this.clear()
  }
  get hash () {
    return (
      globalThis.location.hash.substring(1).replace(/^\//, '') || this.default
    )
  }
  hashKey (name) {
    return `rute_hash_${this.hash}_${name}`
  }
  getStored (key) {
    return JSON.parse(globalThis.localStorage.getItem(key))
  }
  setStored (key, value) {
    globalThis.localStorage.setItem(key, JSON.stringify(value))
  }

  get templateKey () {
    return `rute_template_${this.hash}`
  }
  get template () {
    return JSON.parse(globalThis.localStorage.getItem(this.templateKey))
  }
  set template (value) {
    globalThis.localStorage.setItem(this.templateKey, JSON.stringify(value))
  }

  clear () {
    globalThis.localStorage.clear()
  }
  updateContent (content) {
    this.makeReactive(content.querySelectorAll('[data-bind]'))
    this.createComputed(content.querySelectorAll('[data-compute]'))
    this.root.scrollTo(0, 0)
    this.root.replaceChildren(content)
  }
  createComputed (elements) {
    for (const element of elements) {
      this._tmpElement = element

      const name = element.dataset.compute
      this.computed[name] = element.textContent
      try {
        element.textContent = eval(element.textContent)
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
    if (globalThis[name] === undefined) {
      const _this = this
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get () {
          if (_this._tmpElement) {
            if (!_this.computedObservers[name])
              _this.computedObservers[name] = new Set()
            _this.computedObservers[name].add(_this._tmpElement)
          }
          return JSON.parse(globalThis.localStorage.getItem(key))
        },
        set (value) {
          globalThis.localStorage.setItem(key, JSON.stringify(value))
          _this.observers[name].forEach(
            element =>
              (element[element.value === undefined ? 'textContent' : 'value'] =
                value)
          )
          if (_this.computedObservers[name] !== undefined) {
            for (let element of _this.computedObservers[name]) {
              try {
                element.textContent = eval(
                  _this.computed[element.dataset.compute]
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
    for (let element of elements) {
      const name = element.dataset.bind
      this.reactive(name, element)
    }
  }
  reset () {
    for (const key in this.observers) {
      delete globalThis[key]
    }
    this.observers = {}
  }
  async init () {
    this.reset()
    const fragment = document
      .createRange()
      .createContextualFragment(await this.content())
    this.updateContent(fragment)
  }
  async content () {
    const res = await fetch(this.dir + this.hash + this.ext)
    if (!res.ok)
      return this.page_404 || `<h1>${res.status}</h1><p>${res.statusText}</p>`
    let content = await res.text()
    Object.values(this.conversions).forEach(fn => {
      content = fn(content)
    })
    return content
  }
}

const rute = new Rute()

async function ruteOnRouteChange () {
  rute.init()
}

globalThis.addEventListener('DOMContentLoaded', ruteOnRouteChange)
globalThis.addEventListener('hashchange', ruteOnRouteChange)

globalThis.addEventListener('input', event => {
    if (event.target.dataset.bind === undefined) return
    const name = event.target.dataset.bind
    rute.setStored(rute.hashKey(name), event.target.value)
    globalThis[name] = event.target.value
})
