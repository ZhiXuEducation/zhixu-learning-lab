'use strict';

const holidayCatalog = [
 {id:'2026-12',title:'2026年12月｜小五升小六衔接',open:true,assets:{language:'p5-review',writing:'essay-training',reading:'holiday-dec-reading'}},
 {id:'2027-03',title:'2027年3月｜知识巩固',open:false,assets:{}},
 {id:'2027-06',title:'2027年6月｜能力突破',open:false,assets:{}},
 {id:'2027-09',title:'2027年9月｜考前强化',open:false,assets:{}}
];
const holidayTracks = [
 {id:'language',title:'语文应用',unit:'小五复习'},
 {id:'writing',title:'作文',unit:'作文审题（基础）'},
 {id:'oral',title:'口试'},
 {id:'reading',title:'阅读理解',unit:'阅读理解答案辨析'}
];

function exercisesForCourse(exercises,course){
 return exercises.filter(exercise=>exercise.courses.includes(course)||
  (course==='holiday-training'&&exercise.asset_id==='essay-training'));
}

function holidayExerciseGroups(exercises, course) {
 if(course!=='holiday-training')return [['',exercises]];
 const groups=[];
 for(const period of holidayCatalog){
  for(const track of holidayTracks){
   const matching=exercises.filter(exercise=>exercise.asset_id===period.assets[track.id]);
   if(matching.length)groups.push([period.title+' ／ '+track.title,matching]);
  }
 }
 return groups;
}
