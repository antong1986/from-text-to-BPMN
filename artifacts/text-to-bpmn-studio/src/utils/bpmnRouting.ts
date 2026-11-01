export type NodeBounds = { x: number; y: number; width: number; height: number };
export type Waypoint = [number, number];

export const BRANCH_ROW_HEIGHT = 135; // Keeps gateway branch rows at least 120px apart.
export const MIN_GATEWAY_BRANCH_GAP = 80;
export const LOOP_CLEARANCE = 60;
export const LOOP_LANE_GAP = 28;
const ROUTE_CLEARANCE = 24;
const PORT_STUB = 12;
const TURN_COST = 48;

type RouteFlowOptions = { obstacles?: NodeBounds[] };

function normalize(points:Waypoint[]):Waypoint[] {
  const result:Waypoint[]=[];
  for(const point of points) {
    const last=result.at(-1);
    if(last&&last[0]===point[0]&&last[1]===point[1])continue;
    while(result.length>=2) {
      const a=result[result.length-2],b=result[result.length-1];
      const sameHorizontal=(a[1]===b[1]&&b[1]===point[1]);
      const sameVertical=(a[0]===b[0]&&b[0]===point[0]);
      if(!sameHorizontal&&!sameVertical)break;
      result.pop();
    }
    result.push(point);
  }
  return result;
}

function isInsideExpanded(point:Waypoint,obstacle:NodeBounds):boolean {
  const left=obstacle.x-ROUTE_CLEARANCE;
  const right=obstacle.x+obstacle.width+ROUTE_CLEARANCE;
  const top=obstacle.y-ROUTE_CLEARANCE;
  const bottom=obstacle.y+obstacle.height+ROUTE_CLEARANCE;
  return point[0]>left&&point[0]<right&&point[1]>top&&point[1]<bottom;
}

function segmentIsClear(a:Waypoint,b:Waypoint,obstacles:NodeBounds[]):boolean {
  if(a[0]!==b[0]&&a[1]!==b[1])return false;
  return obstacles.every(obstacle=>{
    const left=obstacle.x-ROUTE_CLEARANCE;
    const right=obstacle.x+obstacle.width+ROUTE_CLEARANCE;
    const top=obstacle.y-ROUTE_CLEARANCE;
    const bottom=obstacle.y+obstacle.height+ROUTE_CLEARANCE;
    if(a[0]===b[0]) {
      const low=Math.min(a[1],b[1]),high=Math.max(a[1],b[1]);
      return a[0]<=left||a[0]>=right||high<=top||low>=bottom;
    }
    const low=Math.min(a[0],b[0]),high=Math.max(a[0],b[0]);
    return a[1]<=top||a[1]>=bottom||high<=left||low>=right;
  });
}

function pathIsClear(points:Waypoint[],obstacles:NodeBounds[]):boolean {
  return points.every((point,index)=>index===0||segmentIsClear(points[index-1],point,obstacles));
}

function findOrthogonalRoute(start:Waypoint,end:Waypoint,obstacles:NodeBounds[]):Waypoint[]|null {
  if(obstacles.some(obstacle=>isInsideExpanded(start,obstacle)||isInsideExpanded(end,obstacle)))return null;
  const vertices:Waypoint[]=[];
  const seen=new Set<string>();
  const addVertex=(point:Waypoint)=>{
    const key=`${point[0]},${point[1]}`;
    if(!seen.has(key)&&!obstacles.some(obstacle=>isInsideExpanded(point,obstacle))) {
      seen.add(key);
      vertices.push(point);
    }
  };
  addVertex(start);
  addVertex(end);
  obstacles.forEach(obstacle=>{
    const left=obstacle.x-ROUTE_CLEARANCE;
    const right=obstacle.x+obstacle.width+ROUTE_CLEARANCE;
    const top=obstacle.y-ROUTE_CLEARANCE;
    const bottom=obstacle.y+obstacle.height+ROUTE_CLEARANCE;
    [[left,top],[left,bottom],[right,top],[right,bottom]].forEach(([x,y])=>addVertex([x,y]));
  });

  const startIndex=vertices.findIndex(point=>point[0]===start[0]&&point[1]===start[1]);
  const endIndex=vertices.findIndex(point=>point[0]===end[0]&&point[1]===end[1]);
  if(startIndex<0||endIndex<0)return null;
  const adjacency=vertices.map(()=>[] as Array<{to:number;points:Waypoint[];cost:number}>);
  const addConnection=(from:number,to:number,points:Waypoint[])=>{
    const normalized=normalize(points);
    const length=normalized.slice(1).reduce((sum,point,index)=>
      sum+Math.abs(point[0]-normalized[index][0])+Math.abs(point[1]-normalized[index][1]),0);
    const cost=length+Math.max(0,normalized.length-2)*TURN_COST;
    adjacency[from].push({to,points:normalized,cost});
    adjacency[to].push({to:from,points:[...normalized].reverse(),cost});
  };

  for(let i=0;i<vertices.length;i++) {
    for(let j=i+1;j<vertices.length;j++) {
      const a=vertices[i],b=vertices[j];
      const candidates=a[0]===b[0]||a[1]===b[1]
        ? [[a,b]]
        : [[a,[a[0],b[1]],b],[a,[b[0],a[1]],b]];
      candidates.forEach(candidate=>{
        if(candidate.slice(1).every((point,index)=>
          segmentIsClear(candidate[index],point,obstacles),
        ))addConnection(i,j,candidate);
      });
    }
  }

  const distances=vertices.map(()=>Number.POSITIVE_INFINITY);
  const previous:Array<{from:number;points:Waypoint[]}|undefined>=vertices.map(()=>undefined);
  const visited=new Set<number>();
  distances[startIndex]=0;
  while(visited.size<vertices.length) {
    let current=-1;
    for(let index=0;index<vertices.length;index++) {
      if(!visited.has(index)&&(current<0||distances[index]<distances[current]))current=index;
    }
    if(current<0||!Number.isFinite(distances[current]))break;
    if(current===endIndex)break;
    visited.add(current);
    for(const edge of adjacency[current]) {
      const next=distances[current]+edge.cost;
      if(next<distances[edge.to]) {
        distances[edge.to]=next;
        previous[edge.to]={from:current,points:edge.points};
      }
    }
  }
  if(!Number.isFinite(distances[endIndex]))return null;

  const segments:Waypoint[][]=[];
  let current=endIndex;
  while(current!==startIndex) {
    const step=previous[current];
    if(!step)return null;
    segments.unshift(step.points);
    current=step.from;
  }
  return normalize(segments.flatMap((segment,index)=>index===0?segment:segment.slice(1)));
}

export function routeFlow(
  from: NodeBounds,
  to: NodeBounds,
  loopY: number,
  lowerGatewayBranch: boolean,
  selfLoop = false,
  options:RouteFlowOptions={},
): Waypoint[] {
  const sourceY = from.y + from.height / 2;
  const targetY = to.y + to.height / 2;
  const right = from.x + from.width;
  const source:Waypoint=[right,sourceY];
  const target:Waypoint=[to.x,targetY];
  const obstacles=options.obstacles??[];
  let points:Waypoint[];

  if (selfLoop) {
    points=[source,[right+40,sourceY],[right+40,loopY],
      [to.x-40,loopY],[to.x-40,targetY],target];
  } else if (to.x <= from.x) {
    points=[source,[right+40,sourceY],[right+40,loopY],
      [to.x-40,loopY],[to.x-40,targetY],target];
  } else if (sourceY === targetY) {
    points=[source,target];
  } else if (lowerGatewayBranch) {
    const bendX=Math.max(right+MIN_GATEWAY_BRANCH_GAP,(right+to.x)/2);
    points=[source,[bendX,sourceY],[bendX,targetY],target];
  } else {
    const bendX=(right+to.x)/2;
    points=[source,[bendX,sourceY],[bendX,targetY],target];
  }

  points=normalize(points);
  if(pathIsClear(points,obstacles))return points;

  const startStub:Waypoint=[source[0]+PORT_STUB,source[1]];
  const endStub:Waypoint=[target[0]-PORT_STUB,target[1]];
  const detour=findOrthogonalRoute(startStub,endStub,obstacles);
  if(!detour)throw new Error("Не удалось проложить BPMN-стрелку вокруг блоков без пересечения.");
  const routed=normalize([source,startStub,...detour.slice(1,-1),endStub,target]);
  if(!pathIsClear(routed,obstacles))throw new Error("BPMN-маршрут пересекает блок процесса.");
  return routed;
}
