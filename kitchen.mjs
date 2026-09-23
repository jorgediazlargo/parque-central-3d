// Rendering and collision layers use the same layout data, in metres.
export function kitchenColliders(data){
  return data.colliders.filter(c=>c.layer!=='alternative');
}
