// Looks a film can share, picked by name in the storyboard's `style_preset`. The text is added to every prompt that does
// not already contain it, after the storyboard's own `style` if there is one.
export const STYLE_PRESETS = {
  "3d-animation": "Polished 3D animated feature-film look: soft rounded character forms, expressive eyes, subsurface skin shading, rich warm lighting, shallow depth of field, clean cinematic colour grade.",
  claymation: "Tactile stop-motion claymation: characters and sets sculpted from plasticine with visible fingerprints and small sculpting marks, slightly uneven handmade movement, warm practical lighting.",
  "concept-sketch": "Loose pencil and ink concept sketch on paper: confident line work, light grey tonal washes, a few accent colours, visible construction lines, unfinished edges.",
  charcoal: "Expressive charcoal drawing: smudged soft blacks, bold gestural strokes, rough paper grain, high contrast with a restrained grey tonal range.",
};

export const STYLE_PRESET_NAMES = Object.keys(STYLE_PRESETS);
