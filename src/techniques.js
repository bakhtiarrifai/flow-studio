// Ready-made direction lines. One per scene: two camera instructions in one clip fight each other.
// `needs` says what the scene must also supply for the preset to work.
const camera = (id, name, phrase) => ({ id, category: "camera", name, phrase });
const transition = (id, name, phrase, needs = "first_frame and last_frame") => ({ id, category: "transition", name, needs, phrase });
const product = (id, name, phrase, needs = "a product photo in reference_images") => ({ id, category: "product", name, needs, phrase });
const image = (id, name, phrase, needs) => ({ id, category: "image", name, needs, phrase });

export const TECHNIQUES = [
  camera("static", "Locked-off static", "The camera is locked off on a tripod: no movement and no cuts, one framing held for the whole shot."),
  camera("slow-push-in", "Slow push-in", "The camera pushes in slowly and steadily toward the subject, ending on a tighter framing."),
  camera("pull-back-reveal", "Pull-back reveal", "The camera pulls straight back from a close-up to a very wide shot, revealing how large the surroundings are."),
  camera("orbit", "Orbit", "The camera circles the subject once at a constant height and distance while the subject holds its position."),
  camera("half-orbit", "Half orbit", "The camera arcs 180 degrees around the subject, from one profile to the other, at a steady pace."),
  camera("crash-zoom", "Crash zoom", "A fast, aggressive zoom toward the subject that stops abruptly with a small impact shake."),
  camera("snap-zoom-eyes", "Snap zoom to eyes", "A sudden snap zoom from a medium shot into an extreme close-up of the eyes, landing in sharp focus."),
  camera("dolly-zoom", "Dolly zoom", "Dolly zoom: the camera tracks back while zooming in, so the subject keeps its size and the background stretches away."),
  camera("drone-rise", "Drone rise", "A drone shot that starts low and climbs steadily, tilting down to keep the subject in frame as the landscape opens up."),
  camera("drone-flyover", "Drone flyover", "A high drone shot gliding forward over the scene at constant altitude, smooth and unhurried."),
  camera("fpv", "FPV fly-through", "A fast FPV drone flight, low and close, weaving through gaps in one continuous take."),
  camera("crane-up", "Crane up", "The camera cranes smoothly from eye level up to a high angle, opening the scene from above."),
  camera("crane-down", "Crane down", "The camera descends from a high angle to eye level, settling on the subject."),
  camera("lateral-track", "Lateral tracking", "The camera tracks sideways alongside the subject at walking pace, foreground objects sliding past for parallax."),
  camera("follow", "Follow from behind", "The camera follows close behind the subject as they move forward, matching their speed."),
  camera("lead", "Lead from the front", "The camera moves backward in front of the subject, holding their face in frame as they walk toward it."),
  camera("handheld", "Handheld", "Handheld documentary camera with slight natural shake and small reframings."),
  camera("top-down", "Top-down", "A strict overhead shot with the camera pointing straight down at the surface."),
  camera("low-angle", "Low hero angle", "A low camera looking up at the subject, making them tower in frame, with a slow push-in."),
  camera("dutch-tilt", "Dutch tilt", "A tilted horizon that slowly levels out over the length of the shot."),
  camera("rack-focus", "Rack focus", "Static framing; focus pulls from the foreground object to the subject in the background."),
  camera("whip-pan-reveal", "Whip pan reveal", "The camera holds, then whips sideways with heavy motion blur and lands on a new subject."),
  camera("slow-motion", "Slow motion", "The whole shot plays in smooth slow motion, every small movement readable."),
  camera("speed-ramp", "Speed ramp", "One continuous shot that ramps from slow motion to a burst of fast motion and back to slow, no cuts."),
  camera("frozen-time", "Frozen time", "Time is frozen: dust, droplets and fabric hang in the air while the camera drifts through the scene."),
  camera("timelapse", "Timelapse", "A locked-off timelapse: clouds, light and shadows race across the scene while the camera stays put."),
  camera("hyperlapse", "Hyperlapse", "A hyperlapse moving forward through the location, the world streaming past at speed with a stable horizon."),
  camera("macro-glide", "Macro glide", "An extreme close-up gliding slowly across the surface with a very shallow depth of field."),
  camera("pov", "Point of view", "First-person point of view: the camera is the character's eyes, with natural head movement."),
  camera("zoom-out-to-space", "Zoom out to space", "One continuous pull-back that begins on the subject and rises through the clouds until the whole planet is in view."),

  transition("seamless-loop", "Seamless loop", "The motion ends exactly where it began, so the clip loops with no visible seam.", "the same image as first_frame and last_frame"),
  transition("match-cut", "Match cut morph", "The main shapes of the opening frame flow and reshape into the matching shapes of the closing frame."),
  transition("whip-pan", "Whip pan transition", "A fast whip pan with heavy motion blur sweeps the opening scene away and lands on the closing frame."),
  transition("before-after", "Before / after", "The camera stays still while the opening frame changes smoothly and continuously into the closing frame."),
  transition("into-the-screen", "Into the screen", "The camera pushes into a screen in the opening frame until its picture fills the view and becomes the closing frame."),
  transition("particle-dissolve", "Particle dissolve", "The subject breaks into fine particles that drift and reassemble as the subject of the closing frame."),
  transition("logo-resolve", "Logo resolve", "The elements of the scene come apart, swirl and assemble into the logo shown in the closing frame.", "your logo as last_frame"),

  product("hero-rotation", "Hero rotation", "The exact product from the reference turns slowly on a dark pedestal, rim light tracing its edges; shape and label unchanged."),
  product("levitation", "Levitation", "The exact product from the reference floats in mid-air and turns slowly above a soft shadow, clean studio look."),
  product("liquid-splash", "Liquid splash", "Liquid bursts around the product in extreme slow motion, droplets catching the light; the product stays sharp and unchanged."),
  product("turntable", "Turntable", "The product sits on a slowly rotating turntable against a seamless backdrop, camera static, even soft light."),

  image("img-cinematic", "Cinematic keyframe", "Cinematic film still, 85mm lens, shallow depth of field, motivated light, subtle film grain."),
  image("img-white-bg", "White background", "The same product on a pure white seamless background with a soft natural shadow; keep the product identical.", "a product photo in reference_images"),
  image("img-outfit", "Change outfit", "Keep the same person, face, pose and background; change only the clothing as described.", "a portrait in reference_images"),
  image("img-cleanup", "Remove clutter", "Remove clutter and stray objects; leave everything else exactly as it is.", "a photo in reference_images"),
];

export const techniqueById = (id) => TECHNIQUES.find((t) => t.id === id);
