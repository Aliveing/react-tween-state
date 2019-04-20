'use strict';

const easingTypes = require('tween-functions');

// additive is the new iOS 8 default. In most cases it simulates a physics-
// looking overshoot behavior (especially with easeInOut. You can test that in
// the example
const DEFAULT_STACK_BEHAVIOR = 'ADDITIVE';
const DEFAULT_EASING = easingTypes.easeInOutQuad;
const DEFAULT_DURATION = 300;
const DEFAULT_DELAY = 0;

// see usage below
function returnState(state) {
  return state;
}

const tweenState = {
  easingTypes: easingTypes,
  stackBehavior: {
    ADDITIVE: 'ADDITIVE',
    DESTRUCTIVE: 'DESTRUCTIVE',
  }
};

class Mixin {
  constructor() {
    this.state = { tweenQueue: [] };
  }

  tweenState = (a, b, c, instance) => {
    // tweenState(stateNameString, config)
    // tweenState(stateRefFunc, stateNameString, config)

    // passing a state name string and retrieving it later from this.state
    // doesn't work for values in deeply nested collections (unless you design
    // the API to be able to parse 'this.state.my.nested[1]', meh). Passing a
    // direct, resolved reference wouldn't work either, since that reference
    // points to the old state rather than the subsequent new ones.
    if (typeof a === 'string') {
      c = b;
      b = a;
      a = returnState;
    }
    this._tweenState(a, b, c, instance);
  }

  _tweenState(stateRefFunc, stateName, config, instance) {
    // _pendingState doesn't exist in React 0.13 anymore. No harm leaving it
    // here for backward compat
    const state = instance._pendingState || instance.state;
    const stateRef = stateRefFunc(state);

    // see the reasoning for these defaults at the top
    const newConfig = {
      easing: config.easing || DEFAULT_EASING,
      duration: config.duration == null ? DEFAULT_DURATION : config.duration,
      delay: config.delay == null ? DEFAULT_DELAY : config.delay,
      beginValue: config.beginValue == null ? stateRef[stateName] : config.beginValue,
      endValue: config.endValue,
      onEnd: config.onEnd,
      stackBehavior: config.stackBehavior || DEFAULT_STACK_BEHAVIOR,
    };

    let newTweenQueue = state.tweenQueue;
    if (newConfig.stackBehavior === tweenState.stackBehavior.DESTRUCTIVE) {
      newTweenQueue = state.tweenQueue.filter(function (item) {
        return item.stateName !== stateName || item.stateRefFunc(state) !== stateRef;
      });
    }

    newTweenQueue.push({
      stateRefFunc: stateRefFunc,
      stateName: stateName,
      config: newConfig,
      initTime: Date.now() + newConfig.delay,
    });

    // tweenState calls setState
    // sorry for mutating. No idea where in the state the value is
    stateRef[stateName] = newConfig.endValue;
    // this will also include the above update
    instance.setState({ tweenQueue: newTweenQueue });

    if (newTweenQueue.length === 1) {
      instance.startRaf();
    }
  }

  getTweeningValue = (a, b) => {
    // see tweenState API
    if (typeof a === 'string') {
      b = a;
      a = returnState;
    }
    return this._getTweeningValue(a, b);
  }

  _getTweeningValue = (stateRefFunc, stateName) => {
    const state = this.state;
    const stateRef = stateRefFunc(state);
    let tweeningValue = stateRef[stateName];
    const now = Date.now();

    for (let i = 0; i < state.tweenQueue.length; i++) {
      const item = state.tweenQueue[i];
      const itemStateRef = item.stateRefFunc(state);
      if (item.stateName !== stateName || itemStateRef !== stateRef) {
        continue;
      }

      const progressTime = now - item.initTime > item.config.duration ?
        item.config.duration :
        Math.max(0, now - item.initTime);
      // `now - item.initTime` can be negative if initTime is scheduled in the
      // future by a delay. In this case we take 0

      const contrib = -item.config.endValue + item.config.easing(
        progressTime,
        item.config.beginValue,
        item.config.endValue,
        item.config.duration
        // TODO: some funcs accept a 5th param
      );
      tweeningValue += contrib;
    }

    return tweeningValue;
  }

  _rafCb = () => {
    const state = this.state;
    if (state.tweenQueue.length === 0) {
      return;
    }

    const now = Date.now();
    const newTweenQueue = [];

    for (let i = 0; i < state.tweenQueue.length; i++) {
      const item = state.tweenQueue[i];
      if (now - item.initTime < item.config.duration) {
        newTweenQueue.push(item);
      } else {
        item.config.onEnd && item.config.onEnd();
      }
    }

    // onEnd might trigger a parent callback that removes this component
    if (!this.isMounted()) {
      return;
    }

    this.setState({
      tweenQueue: newTweenQueue,
    });

    requestAnimationFrame(this._rafCb);
  }

  startRaf = () => {
    requestAnimationFrame(this._rafCb);
  }
}

tweenState.Mixin = new Mixin();

module.exports = tweenState;
