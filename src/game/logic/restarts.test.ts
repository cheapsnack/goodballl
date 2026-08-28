import { describe, it, expect } from "vitest";
import { detectOutOfBounds } from "./src/game/logic/restarts";
const ball = (x:number,z:number)=>({position:{x,y:0.36,z},velocity:{x:0,y:0,z:0},heading:0,spin:0});
describe("restarts",()=>{
  it("throw-in to away when home puts it out",()=>{
    const r=detectOutOfBounds(ball(0,33),ball(0,36),"home")!;
    expect(r.type).toBe("throw-in"); expect(r.team).toBe("away");
  });
  it("goal kick when attacker shoots wide",()=>{
    const r=detectOutOfBounds(ball(50,10),ball(55,12),"home")!;
    expect(r.type).toBe("goal-kick"); expect(r.team).toBe("away");
  });
  it("corner when defender deflects behind own line",()=>{
    const r=detectOutOfBounds(ball(50,10),ball(55,12),"away")!;
    expect(r.type).toBe("corner"); expect(r.team).toBe("home");
  });
  it("corner for home at own end when home defends -x", ()=>{
    const r=detectOutOfBounds(ball(-50,-10),ball(-55,-12),"home")!;
    expect(r.type).toBe("corner"); expect(r.team).toBe("away");
  });
  it("in play returns null",()=>{ expect(detectOutOfBounds(ball(0,0),ball(1,1),"home")).toBeNull(); });
});
