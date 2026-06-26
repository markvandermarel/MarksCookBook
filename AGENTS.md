# AGENTS.md

## Product design direction

The app should look polished, calm, modern, and production-ready from the first implementation.

Avoid a generic demo-app look. Do not use random colors, default browser styling, or visually flat layouts unless explicitly requested.

## Visual style

Use:
- Clean modern layout
- Strong visual hierarchy
- Generous whitespace
- Consistent spacing based on an 8px rhythm
- Rounded cards and buttons, but avoid childish over-rounding
- Subtle shadows/borders only where they improve separation
- One primary accent color, used sparingly
- Clear typography scale for headings, body text, labels, helper text
- Mobile-first responsive layout

Design direction:
Friendly and clear, suitable for a child using a tablet, but not childish. Large touch targets, soft colors, simple navigation, strong visual feedback, minimal clutter, and readable typography.

Avoid:
- Centered everything
- Too many colors
- Inconsistent button styles
- Dense forms
- Placeholder-looking dashboards
- Unstyled HTML elements
- Mixing multiple design languages

## UI implementation rules

Before building screens:
1. Define or reuse design tokens for color, spacing, radius, typography, and shadows.
2. Create reusable components for buttons, cards, inputs, layout containers, navigation, empty states, loading states, and error states.
3. Use existing project conventions where available.
4. Do not invent a parallel styling system if the repo already has one.

## Definition of done for UI work

A UI task is only done when:
- The page looks coherent on desktop and mobile.
- Primary, secondary, empty, loading, and error states are handled.
- Spacing is consistent.
- Typography hierarchy is clear.
- Components are reused instead of duplicated.
- The app builds without errors.
- The result is visually reviewed in a browser.
