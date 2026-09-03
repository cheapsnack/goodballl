# Set-piece polish: responsive power bar + bigger, better-looking goal

## 1. Power bar feels laggy behind the press

The bar is driven correctly each frame, but the fill also carries a CSS width
transition, so the green fill visually trails the actual charge. Fix in both
`PenaltyShootout.tsx` and `FreeKick.tsx`:

- Drop the `transition-[width]` on the fill so width follows the frame value instantly.
- Start the fill from a small minimum width the moment charging begins, so the press
  registers visually on the first frame.
- Shorten the fill time slightly so a full charge feels responsive:
  penalties Easy/Normal/Hard `1.5/1.1/0.7` becomes `1.1/0.85/0.6`; free kicks
  `1.7/1.25/0.85` becomes `1.25/0.95/0.7`.

## 2. Goal looks small and the set-piece scene looks rough

In `SetPiece3DScene.tsx`:

- Bring the camera closer to the goal line and narrow the field of view so the
  frame is filled by the goal (currently the goal sits small in the middle of a
  wide green box).
- Give the goal real presence: thicker posts and crossbar, a proper net rendered
  as a fine grid rather than a flat translucent plane, a stanchion depth so the
  net reads three-dimensional, and a subtle shadow under the frame.
- Tidy the surroundings: mown grass stripes and a penalty box arc/line drawn in
  the 3D ground instead of the flat green gradient, so the shot has depth cues.
- Keep every gameplay number unchanged — aim, keeper reach, wall placement and
  outcome maths are untouched; this is framing and materials only.

## 3. Scope

Visual and input-feel only. No changes to `penalties.ts` / `freekicks.ts`
outcome logic beyond the power-fill durations listed above; existing tests stay green.
