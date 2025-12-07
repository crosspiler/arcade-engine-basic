import './index.css'
import { App } from './App'

const appRoot = document.getElementById('app')
if (appRoot) {
  new App(appRoot as HTMLDivElement)
}