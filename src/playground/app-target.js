import ReactDOM from 'react-dom';
import {setAppElement} from 'react-modal';

// Suppress React warnings about deprecated lifecycle methods
// These warnings come from react-redux and other dependencies
const originalConsoleError = console.error;
console.error = (...args) => {
    // Suppress componentWillMount, componentWillReceiveProps, componentWillUpdate warnings
    if (args[0] && typeof args[0] === 'string' && 
        (args[0].includes('componentWillMount') || 
        args[0].includes('componentWillReceiveProps') || 
        args[0].includes('componentWillUpdate'))) {
        return;
    }
    // Suppress PropType warnings for messages.tw.blocks.addons
    if (args[0] && typeof args[0] === 'string' && 
        args[0].includes('Invalid prop') && 
        args[0].includes('messages.tw.blocks.addons')) {
        return;
    }
    // Suppress PropType warnings for items[0].order
    if (args[0] && typeof args[0] === 'string' && 
        args[0].includes('items[0].order')) {
        return;
    }
    originalConsoleError.apply(console, args);
};

const appTarget = document.getElementById('app');

// Remove everything from the target to fix macOS Safari "Save Page As",
while (appTarget.firstChild) {
    appTarget.removeChild(appTarget.firstChild);
}

setAppElement(appTarget);

const render = children => {
    ReactDOM.render(children, appTarget);

    if (window.SplashEnd) {
        window.SplashEnd();
    }
};

export default render;
