export type NodeBounds = { x: number; y: number; width: number; height: number };
export type Waypoint = [number, number];

export const BRANCH_ROW_HEIGHT = 135; // 25px half-gateway + 110px vertical branch.
export const LOOP_CLEARANCE = 60;
export const LOOP_LANE_GAP = 28;

export function routeFlow(
  from: NodeBounds,
  to: NodeBounds,
  loopY: number,
  lowerGatewayBranch: boolean,
  selfLoop = false,
): Waypoint[] {
  const sourceX = from.x + from.width / 2;
  const targetX = to.x + to.width / 2;
  const sourceY = from.y + from.height / 2;
  const targetY = to.y + to.height / 2;
  const right = from.x + from.width;
  let points: Waypoint[];

  if (selfLoop) {
    // A self-loop needs a separate right-side segment, not a zero-width U.
    points = [[sourceX, from.y], [sourceX, loopY],
      [right + 40, loopY], [right + 40, sourceY], [right, sourceY]];
  } else if (to.x <= from.x) {
    points = [[sourceX, from.y], [sourceX, loopY],
      [targetX, loopY], [targetX, to.y]];
  } else if (sourceY === targetY) {
    points = [[right, sourceY], [to.x, targetY]];
  } else if (lowerGatewayBranch) {
    // The branch row is 135px below the gateway centre: a 110px drop
    // from its bottom vertex, followed by a horizontal entry into the target.
    const bottom = from.y + from.height;
    const branchY = bottom + 110;
    if (targetY === branchY) {
      points = [[sourceX, bottom], [sourceX, branchY], [to.x, targetY]];
    } else {
      // For deeper rows, retain the 110px first leg and change rows
      // in the empty inter-column gap, not through the target's body.
      const bendX = right + (to.x - right) / 2;
      points = [[sourceX, bottom], [sourceX, branchY], [bendX, branchY],
        [bendX, targetY], [to.x, targetY]];
    }
  } else {
    // Different rows require two bends in the gap between columns.
    const bendX = right + (to.x - right) / 2;
    points = [[right, sourceY], [bendX, sourceY], [bendX, targetY], [to.x, targetY]];
  }

  return points.filter((point, i) => i === 0 ||
    point[0] !== points[i - 1][0] || point[1] !== points[i - 1][1]);
}
