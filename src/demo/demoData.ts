/** Standalone demonstration data. No Supabase reads or writes. */
export const demoNurses = [
  {
    "id": "demo-1",
    "full_name": "Sarah Miller"
  },
  {
    "id": "demo-2",
    "full_name": "Emma Johnson"
  },
  {
    "id": "demo-3",
    "full_name": "Chloe Davis"
  },
  {
    "id": "demo-4",
    "full_name": "Jessica Taylor"
  },
  {
    "id": "demo-5",
    "full_name": "Rachel Anderson"
  },
  {
    "id": "demo-6",
    "full_name": "Hannah Martinez"
  },
  {
    "id": "demo-7",
    "full_name": "Nicole Robinson"
  },
  {
    "id": "demo-8",
    "full_name": "Lauren Clark"
  },
  {
    "id": "demo-9",
    "full_name": "Mia Lewis"
  },
  {
    "id": "demo-10",
    "full_name": "Samantha Hall"
  },
  {
    "id": "demo-11",
    "full_name": "Emily Young"
  },
  {
    "id": "demo-12",
    "full_name": "Olivia King"
  },
  {
    "id": "demo-13",
    "full_name": "David Smith"
  },
  {
    "id": "demo-14",
    "full_name": "Michael Brown"
  },
  {
    "id": "demo-15",
    "full_name": "Daniel Wilson"
  },
  {
    "id": "demo-16",
    "full_name": "James Garcia"
  },
  {
    "id": "demo-17",
    "full_name": "Alex Martinez"
  },
  {
    "id": "demo-18",
    "full_name": "Ryan Anderson"
  },
  {
    "id": "demo-19",
    "full_name": "Matthew Thomas"
  },
  {
    "id": "demo-20",
    "full_name": "Joshua Jackson"
  }
] as const;
export const demoShiftTimes = { morning: ['07:00','15:00'], evening: ['15:00','23:00'], night: ['23:00','07:00'] } as const;
export const demoHeadcount = {morning:6,evening:6,night:4} as const;
export function generateDemoShifts(startDate = '2026-10-18', days = 14) {
 const shifts: {id:string;date:string;type:keyof typeof demoHeadcount;start_time:string;end_time:string;assigned_user_id:string;is_draft:boolean}[] = [];
 const base = new Date(startDate+'T12:00:00Z');
 for(let day=0;day<days;day++) {
  const date = new Date(base.getTime()+day*86400000).toISOString().slice(0,10);
  let offset=0;
  for(const type of ['morning','evening','night'] as const) {
   for(let slot=0;slot<demoHeadcount[type];slot++) {
    const nurse=demoNurses[(day*7+offset+slot)%demoNurses.length];
    shifts.push({id:`demo-${date}-${type}-${slot}`,date,type,start_time:demoShiftTimes[type][0],end_time:demoShiftTimes[type][1],assigned_user_id:nurse.id,is_draft:false});
   }
   offset+=demoHeadcount[type];
  }
 }
 return shifts;
}
