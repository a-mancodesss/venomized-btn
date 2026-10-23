# Venomized button

Open `index.html` directly in a browser. No build step, dependencies, or remote assets.

Move a mouse or pen within 150px of the resting button's outline to attach. The bond stretches until you move beyond 245px, then retracts while the button springs back. Click the button for a connection response; use Replay to see the motion without moving a pointer. Touch users can tap both controls.

Tune `attachDistance`, `releaseDistance`, `maxPull`, `spring`, and `damping` in the `settings` object at the top of `script.js`. Separate attach and release distances prevent flickering at the proximity boundary.

To connect your own action, listen for `venom:activate` on the button or document. The demo does not send messages or open an external service.

The effect respects reduced motion, preserves keyboard focus and native button activation, and stops drawing when idle or when the tab is hidden. The tendrils use Canvas 2D; the pill and its reflections use CSS.
