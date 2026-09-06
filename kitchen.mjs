// Rendering and collision layers use the same layout data, in metres.
export function kitchenColliders(data,alternative=false){
  const [dx,dz]=data.kitchenVariant.islandOffset;
  return data.colliders.filter(c=>c.layer!==(alternative?'original':'alternative')).map(c=>
    alternative&&c.layer==='island'?{...c,poly:c.poly.map(([x,z])=>[x+dx,z+dz])}:c);
}
