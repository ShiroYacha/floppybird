/*
   Copyright 2014 Nebez Briefkani
   floppybird - main.js

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

var debugmode = false;

var states = Object.freeze({
   SplashScreen: 0,
   GameScreen: 1,
   ScoreScreen: 2
});

var currentstate;

var gravity = 0.25;
var velocity = 0;
var position = 180;
var rotation = 0;
var jump = -4.6;

var score = 0;
var highscore = 0;

var pipeheight = 90;
var pipewidth = 52;
var pipes = new Array();

var replayclickable = false;

var updaterate = 1000 / 60;

//sounds
var volume = 30;
var soundJump = new buzz.sound("assets/sounds/sfx_wing.ogg");
var soundScore = new buzz.sound("assets/sounds/sfx_point.ogg");
var soundHit = new buzz.sound("assets/sounds/sfx_hit.ogg");
var soundDie = new buzz.sound("assets/sounds/sfx_die.ogg");
var soundSwoosh = new buzz.sound("assets/sounds/sfx_swooshing.ogg");
buzz.all().setVolume(volume);

//loops
var loopGameloop;
var loopPipeloop;


$(document).ready(function() {
   if(window.location.search == "?debug")
      debugmode = true;
   if(window.location.search == "?easy")
      pipeheight = 200;

   //get the highscore
   var savedscore = getCookie("highscore");
   if(savedscore != "")
      highscore = parseInt(savedscore);

   // Initialize matrix to steady freq
   init_matrix();
   // Initialize hitmatrix to ones
   init_hit_matrix();

   xs = new Array();
   ys = new Array();
   rs = new Array();

   //start with the splash screen
   showSplash();
});

function getCookie(cname)
{
   var name = cname + "=";
   var ca = document.cookie.split(';');
   for(var i=0; i<ca.length; i++)
   {
      var c = ca[i].trim();
      if (c.indexOf(name)==0) return c.substring(name.length,c.length);
   }
   return "";
}

function setCookie(cname,cvalue,exdays)
{
   var d = new Date();
   d.setTime(d.getTime()+(exdays*4*60*60*1000));
   var expires = "expires="+d.toGMTString();
   document.cookie = cname + "=" + cvalue + "; " + expires;
}

function showSplash()
{
   currentstate = states.SplashScreen;

   //set the defaults (again)
   velocity = 0;
   position = 180;
   rotation = 0;
   score = 0;

   //update the player in preparation for the next game
   $("#player").css({ y: 0, x: 0});
   updatePlayer($("#player"));

   soundSwoosh.stop();
   soundSwoosh.play();

   //clear out all the pipes if there are any
   $(".pipe").remove();
   pipes = new Array();

   //make everything animated again
   $(".animated").css('animation-play-state', 'running');
   $(".animated").css('-webkit-animation-play-state', 'running');

   //fade in the splash
   $("#splash").transition({ opacity: 1 }, 2000, 'ease');

   setTimeout(screenClick, 1000);
}

function startGame()
{
   currentstate = states.GameScreen;

   //fade out the splash
   $("#splash").stop();
   $("#splash").transition({ opacity: 0 }, 500, 'ease');

   //update the big score
   setBigScore();

   //debug mode?
   if(debugmode)
   {
      //show the bounding boxes
      $(".boundingbox").show();
   }

   //start up our loops
   loopGameloop = setInterval(gameloop, updaterate);
   loopPipeloop = setInterval(updatePipes, 1400);
   loopAIloop = setInterval(AILoop, ai_freq);
   loopStatsloop= setInterval(statsLoop, mesure_freq);
   handleJumpTimeout = setTimeout(jumpAndSet, jump_freq);
   //jump from the start!
   playerJump();
}


function updatePlayer(player)
{
   //rotation
   rotation = Math.min((velocity / 10) * 90, 90);

   $('#rotation').text(function(i, oldText) {
      return "rotation: ".concat(rotation);
   });
   //apply rotation and position
   $(player).css({ rotate: rotation, top: position });
}

var y1, y2, r;

function report () {
   console.log(" Diff = ".concat(data_mat_size+y1-y2).concat(" r=").concat(r).concat(" Hitmat=").concat(hitMatrix[data_mat_size+y1-y2][r]).concat(" freq=").concat(jump_freq));
}

function gameloop() {
   var player = $("#player");

   //update the player speed/position
   velocity += gravity;
   position += velocity;

   //update the player
   updatePlayer(player);

   //create the bounding box
   var box = document.getElementById('player').getBoundingClientRect();
   var origwidth = 34.0;
   var origheight = 24.0;

   var boxwidth = origwidth - (Math.sin(Math.abs(rotation) / 90) * 8);
   var boxheight = (origheight + box.height) / 2;
   var boxleft = ((box.width - boxwidth) / 2) + box.left;
   var boxtop = ((box.height - boxheight) / 2) + box.top;
   var boxright = boxleft + boxwidth;
   var boxbottom = boxtop + boxheight;

   //if we're in debug mode, draw the bounding box
   if(debugmode)
   {
      var boundingbox = $("#playerbox");
      boundingbox.css('left', boxleft);
      boundingbox.css('top', boxtop);
      boundingbox.css('height', boxheight);
      boundingbox.css('width', boxwidth);
   }

   //did we hit the ground?
   if(box.bottom >= $("#land").offset().top)
   {
      playerDead();
      return;
   }

   //have they tried to escape through the ceiling? :o
   var ceiling = $("#ceiling");
   if(boxtop <= (ceiling.offset().top + ceiling.height()))
      position = 0;

   //we can't go any further without a pipe
   if(pipes[0] == null)
      return;

   //determine the bounding box of the next pipes inner area
   var nextpipe = pipes[0];
   var nextpipeupper = nextpipe.children(".pipe_upper");

   var pipetop = nextpipeupper.offset().top + nextpipeupper.height();
   var pipeleft = nextpipeupper.offset().left - 2; // for some reason it starts at the inner pipes offset, not the outer pipes.
   var piperight = pipeleft + pipewidth;
   var pipebottom = pipetop + pipeheight;

   if(debugmode)
   {
      var boundingbox = $("#pipebox");
      boundingbox.css('left', pipeleft);
      boundingbox.css('top', pipetop);
      boundingbox.css('height', pipeheight);
      boundingbox.css('width', pipewidth);
   }

   if (pipeleft - boxright <= 189 && !takenCareByInterp) {
      // first pipe imminent
      y1 = Math.round(position);
      y2 = Math.round((pipetop+pipebottom)/2);
      r  = Math.round((90+rotation)/9);
      report();
      jump_freq = dataMatrix[data_mat_size+y1-y2][r];
      takenCareByInterp = true;
   };

   //have we gotten inside the pipe yet?
   if(boxright > pipeleft)
   {
      //we're within the pipe, have we passed between upper and lower pipes?
      if(boxtop > pipetop && boxbottom < pipebottom)
      {
         //yeah! we're within bounds

      }
      else
      {
         //no! we touched the pipe, adjust by a step
         dataMatrix[data_mat_size+y1-y2][r] += boxtop < pipetop ? training_delta_step/hitMatrix[data_mat_size+y1-y2][r] : -training_delta_step/hitMatrix[data_mat_size+y1-y2][r];
         hitMatrix[data_mat_size+y1-y2][r]++;
         playerDead();
         return;
      }
   }


   //have we passed the imminent danger?
   if((boxleft+boxright)/2 > (pipeleft+piperight)/2)
   {
      //yes, remove it
      pipes.splice(0, 1);

      y1 = Math.round(position);
      r = Math.round((90+rotation)/9);

      //determine the bounding box of the next pipes inner area
      var nextpipe = pipes[0];
      var nextpipeupper = nextpipe.children(".pipe_upper");

      var pipetop = nextpipeupper.offset().top + nextpipeupper.height();
      var pipebottom = pipetop + pipeheight;

      y2 = Math.round((pipetop+pipebottom)/2);

      jump_freq = dataMatrix[data_mat_size+y1-y2][r];

      report();

      if (y1 > y2) {
         clearTimeout(handleJumpTimeout);
         handleJumpTimeout = jumpAndSet();
      };
      // decrease dramatically the training delta
      hitMatrix[data_mat_size+y1-y2][r]+=3;

      // save for training
      if ($.inArray(data_mat_size+y1-y2, xs) == -1) {
         xs.push(data_mat_size+y1-y2);
         ys.push(dataMatrix[data_mat_size+y1-y2][r]);
         rs.push(r);
      };
      //and score a point
      console.log("xs length: ".concat(xs.length));
      playerScore();
   }
}

//Handle space bar
$(document).keydown(function(e){
   //space bar!
   if(e.keyCode == 32)
   {
      //in ScoreScreen, hitting space should click the "replay" button. else it's just a regular spacebar hit
      if(currentstate == states.ScoreScreen)
         $("#replay").click();
      else
         screenClick();
   }
});

//Handle mouse down OR touch start
if("ontouchstart" in window)
   $(document).on("touchstart", screenClick);
else
   $(document).on("mousedown", screenClick);

function screenClick()
{
   if(currentstate == states.GameScreen)
   {
      playerJump();
   }
   else if(currentstate == states.SplashScreen)
   {
      startGame();
   }
}

function playerJump()
{
   velocity = jump;
   //play jump sound
   soundJump.stop();
   soundJump.play();
}

function setBigScore(erase)
{
   var elemscore = $("#bigscore");
   elemscore.empty();

   if(erase)
      return;

   var digits = score.toString().split('');
   for(var i = 0; i < digits.length; i++)
      elemscore.append("<img src='assets/font_big_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setSmallScore()
{
   var elemscore = $("#currentscore");
   elemscore.empty();

   var digits = score.toString().split('');
   for(var i = 0; i < digits.length; i++)
      elemscore.append("<img src='assets/font_small_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setHighScore()
{
   var elemscore = $("#highscore");
   elemscore.empty();

   var digits = highscore.toString().split('');
   for(var i = 0; i < digits.length; i++)
      elemscore.append("<img src='assets/font_small_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setMedal()
{
   var elemmedal = $("#medal");
   elemmedal.empty();

   if(score < 10)
      //signal that no medal has been won
      return false;

   if(score >= 10)
      medal = "bronze";
   if(score >= 20)
      medal = "silver";
   if(score >= 30)
      medal = "gold";
   if(score >= 40)
      medal = "platinum";

   elemmedal.append('<img src="assets/medal_' + medal +'.png" alt="' + medal +'">');

   //signal that a medal has been won
   return true;
}

function playerDead()
{
   //stop animating everything!
   $(".animated").css('animation-play-state', 'paused');
   $(".animated").css('-webkit-animation-play-state', 'paused');

   //drop the bird to the floor
   var playerbottom = $("#player").position().top + $("#player").width(); //we use width because he'll be rotated 90 deg
   var floor = $("#flyarea").height();
   var movey = Math.max(0, floor - playerbottom);
   $("#player").transition({ y: movey + 'px', rotate: 90}, 1000, 'easeInOutCubic');

   //it's time to change states. as of now we're considered ScoreScreen to disable left click/flying
   currentstate = states.ScoreScreen;

   //destroy our gameloops
   clearInterval(loopGameloop);
   clearInterval(loopPipeloop);
   clearInterval(loopAIloop);
   clearInterval(loopStatsloop);
   clearTimeout(handleJumpTimeout);
   loopStatsloop = null;
   loopAIloop = null;
   loopGameloop = null;
   loopPipeloop = null;

   jump_freq = init_jump_freq;
   init_pos = init_pos;

   takenCareByInterp = false;
   //mobile browsers don't support buzz bindOnce event
   if(isIncompatible.any())
   {
      //skip right to showing score
      showScore();
   }
   else
   {
      //play the hit sound (then the dead sound) and then show score
      soundHit.play().bindOnce("ended", function() {
         soundDie.play().bindOnce("ended", function() {
            showScore();
         });
      });
   }

   // if (xs.length >= threshold) {
   //    console.log("Training...");
   //    CSPL_train(xs, ys);
   //    threshold *= 2;
   // };
}

function replay () {
   if(currentstate == states.ScoreScreen)
      $("#replay").click();
}

function showScore()
{
   //unhide us
   $("#scoreboard").css("display", "block");

   //remove the big score
   setBigScore(true);

   //have they beaten their high score?
   if(score > highscore)
   {
      //yeah!
      highscore = score;
      //save it!
      setCookie("highscore", highscore, 999);
   }

   //update the scoreboard
   setSmallScore();
   setHighScore();
   var wonmedal = setMedal();

   //SWOOSH!
   soundSwoosh.stop();
   soundSwoosh.play();

   //show the scoreboard
   $("#scoreboard").css({ y: '40px', opacity: 0 }); //move it down so we can slide it up
   $("#replay").css({ y: '40px', opacity: 0 });
   $("#scoreboard").transition({ y: '0px', opacity: 1}, 600, 'ease', function() {
      //When the animation is done, animate in the replay button and SWOOSH!
      soundSwoosh.stop();
      soundSwoosh.play();
      $("#replay").transition({ y: '0px', opacity: 1}, 600, 'ease');

      //also animate in the MEDAL! WOO!
      if(wonmedal)
      {
         $("#medal").css({ scale: 2, opacity: 0 });
         $("#medal").transition({ opacity: 1, scale: 1 }, 1200, 'ease');
      }
   });

   //make the replay button clickable
   replayclickable = true;
   replay();
}

$("#replay").click(function() {
   //make sure we can only click once
   if(!replayclickable)
      return;
   else
      replayclickable = false;
   //SWOOSH!
   soundSwoosh.stop();
   soundSwoosh.play();

   //fade out the scoreboard
   $("#scoreboard").transition({ y: '-40px', opacity: 0}, 1000, 'ease', function() {
      //when that's done, display us back to nothing
      $("#scoreboard").css("display", "none");

      //start the game over!
      showSplash();
   });
});

function playerScore()
{
   score += 1;
   //play score sound
   soundScore.stop();
   soundScore.play();
   setBigScore();
}

function updatePipes()
{
   //Do any pipes need removal?
   $(".pipe").filter(function() { return $(this).position().left <= -100; }).remove()

   //add a new pipe (top height + bottom height  + pipeheight == 420) and put it in our tracker
   var padding = 80;
   var constraint = 420 - pipeheight - (padding * 2); //double padding (for top and bottom)
   var topheight = Math.floor((Math.random()*constraint) + padding); //add lower padding
   var bottomheight = (420 - pipeheight) - topheight;
   var newpipe = $('<div class="pipe animated"><div class="pipe_upper" style="height: ' + topheight + 'px;"></div><div class="pipe_lower" style="height: ' + bottomheight + 'px;"></div></div>');
   $("#flyarea").append(newpipe);
   pipes.push(newpipe);
}




// ============== AI implementatino

var loopAIloop;
var statsLoop;
var handleJumpTimeout;

// AI const
var deltaMin = - 250;
var deltaMax = - deltaMin;
var mesure_freq = updaterate;
var init_jump_freq = 610;
var init_pos = position;
var ai_freq = 100;
var urgency = 30;
var training_delta_step = 100;

var data_mat_size = 420;
var threshold = 5;
var takenCareByInterp = false;

// Control vars
var jump_freq = init_jump_freq;

// Stats vars
var avg_pos = position;
var sum_pos = 0;
var count_average = 0;

// Interp
var variogram;
var dataMatrix;
var hitMatrix;

function fillArrayWithNumber(n, k) {
   var arr = Array.apply(null, Array(n));
   return arr.map(function (x, i) { return k });
}

function init_matrix () {
   // var data = [1010,1009.047619047619,1008.0952380952381,1007.1428571428571,1006.1904761904761,1005.2380952380952,1004.2857142857142,1003.3333333333333,1002.3809523809524,1001.4285714285714,1000.4761904761905,999.5238095238095,998.5714285714286,997.6190476190476,996.6666666666667,995.7142857142858,994.7619047619048,993.8095238095239,992.8571428571429,991.9047619047619,990.952380952381,990,989.047619047619,988.0952380952381,987.1428571428571,986.1904761904761,985.2380952380952,984.2857142857142,983.3333333333333,982.3809523809524,981.4285714285714,980.4761904761905,979.5238095238095,978.5714285714286,977.6190476190476,976.6666666666667,975.7142857142858,974.7619047619048,973.8095238095239,972.8571428571429,971.9047619047619,970.952380952381,970,969.047619047619,968.0952380952381,967.1428571428571,966.1904761904761,965.2380952380952,964.2857142857142,963.3333333333333,962.3809523809524,961.4285714285714,960.4761904761905,959.5238095238095,958.5714285714286,957.6190476190476,956.6666666666667,955.7142857142858,954.7619047619048,953.8095238095239,952.8571428571429,951.9047619047619,950.952380952381,950,949.047619047619,948.0952380952381,947.1428571428571,946.1904761904761,945.2380952380952,944.2857142857142,943.3333333333333,942.3809523809524,941.4285714285714,940.4761904761905,939.5238095238095,938.5714285714286,937.6190476190476,936.6666666666667,935.7142857142858,934.7619047619048,933.8095238095239,932.8571428571429,931.9047619047619,930.952380952381,930,929.047619047619,928.0952380952381,927.1428571428571,926.1904761904761,925.2380952380952,924.2857142857142,923.3333333333333,922.3809523809524,921.4285714285714,920.4761904761905,919.5238095238095,918.5714285714286,917.6190476190476,916.6666666666667,915.7142857142858,914.7619047619048,913.8095238095239,912.8571428571429,911.9047619047619,910.952380952381,910,909.047619047619,908.0952380952381,907.1428571428571,906.1904761904761,905.2380952380952,904.2857142857142,903.3333333333333,902.3809523809524,901.4285714285714,900.4761904761905,899.5238095238095,898.5714285714286,897.6190476190476,896.6666666666667,895.7142857142858,894.7619047619048,893.8095238095239,892.8571428571429,891.9047619047619,890.952380952381,890,889.047619047619,888.0952380952381,887.1428571428571,886.1904761904761,885.2380952380952,884.2857142857142,883.3333333333333,882.3809523809524,881.4285714285714,880.4761904761905,879.5238095238095,878.5714285714286,877.6190476190476,876.6666666666667,875.7142857142858,874.7619047619048,873.8095238095239,872.8571428571429,871.9047619047619,870.952380952381,870,869.047619047619,868.0952380952381,867.1428571428571,866.1904761904761,865.2380952380952,864.2857142857142,863.3333333333334,862.3809523809524,861.4285714285714,860.4761904761905,859.5238095238095,858.5714285714286,857.6190476190476,856.6666666666666,855.7142857142858,854.7619047619048,853.8095238095239,852.8571428571429,851.9047619047619,850.952380952381,850,849.047619047619,848.0952380952381,847.1428571428571,846.1904761904761,845.2380952380952,844.2857142857142,843.3333333333334,842.3809523809524,841.4285714285714,840.4761904761905,839.5238095238095,838.5714285714286,837.6190476190476,836.6666666666666,835.7142857142858,834.7619047619048,833.8095238095239,832.8571428571429,831.9047619047619,830.952380952381,830,829.047619047619,828.0952380952381,827.1428571428571,826.1904761904761,825.2380952380952,824.2857142857142,823.3333333333334,822.3809523809524,821.4285714285714,820.4761904761905,819.5238095238095,818.5714285714286,817.6190476190476,816.6666666666666,815.7142857142858,814.7619047619048,813.8095238095239,812.8571428571429,811.9047619047619,810.952380952381,810,809.047619047619,808.0952380952381,807.1428571428571,843.6904761904761,861.4880952380952,804.2857142857142,803.3333333333334,802.3809523809524,887.0535714285714,856.7261904761905,855.7738095238095,876.6964285714286,853.8690476190476,834.1666666666666,881.3392857142858,832.2619047619048,850.0595238095239,898.9434523809524,870.0297619047619,888.1845238095239,846.25,880.922619047619,890.014880952381,855.8928571428571,864.3154761904761,841.4880952380952,862.4107142857142,852.0833333333334,874.2559523809524,867.0535714285714,872.3511904761905,889.360119047619,875.8035714285714,874.8511904761905,873.8988095238095,906.7808386466476,866.6369047619048,859.4345238095239,882.6934523809524,877.9910714285714,872.8720238095239,855.625,876.6871245054854,887.3502539127538,873.2291666666666,863.422619047619,862.4702380952381,888.7193015318014,869.4196428571429,875.6263528138528,863.3482142857143,862.3958333333334,869.360119047619,864.6577380952381,873.989448051948,869.912067099567,877.647872960373,860.8482142857143,892.2150206926718,960.1732174552511,853.8244047619048,848.1845238095239,869.2550158175158,875.8249562937062,850.014880952381,853.2291666666666,931.4739655671025,864.4931110556109,974.3789082057364,865.2669205794206,907.6786515521541,865.743111055611,921.648604269294,925.1573367022675,896.475343265757,868.6856005514094,855.1012868430626,912.0159321567621,853.6757543926662,886.018105668841,844.207298136646,850.7732274496664,846.728368556771,831.9196428571429,850.5038415597364,858.6550104307456,904.5757520665609,848.1523990855402,817.8220261341282,840.7851583031438,878.6933780289759,839.6033375999725,816.3793136054212,813.6425543187563,880.2396894507652,798.6807808097476,856.8949950773608,842.5708725153272,881.0178010012005,831.7765123382314,820.2738738804904,826.3223846996606,856.0374221846718,853.6904276627258,776.5984316657567,845.179177737437,855.8594820951236,818.0188527943026,811.398673572166,813.0607044014148,809.8608006203592,789.3804451384807,801.6105441614698,762.3561929976081,828.9401203643057,815.4174873905479,768.2906821151555,740.1856274383207,780.6073874515413,773.9696474424005,773.939443251357,731.5086263032687,731.1003401683133,750.2003230874294,730.7357165815281,731.3335512851008,732.2139789062085,725.9896362044004,710.192655632548,719.3220075696681,717.3283984754557,735.8238951756232,738.6099562941175,721.4497908222675,702.002105507319,705.9205740976638,713.1397960669906,730.6933555151156,725.3609478173538,694.3457453010997,704.5022918903416,695.1302544827336,698.02850979918,696.7215562335555,696.5632421568368,693.9157028665344,694.7403393020523,694.8452054925402,707.5283846081927,693.1975566017412,697.8213821575507,687.5710969200939,684.0946927574505,680.6216693669237,687.7184840890475,686.3329067278872,680.3747315753316,672.9620333142359,681.8720819024786,681.7040181655289,658.0438634397109,670.5045373764688,666.5162828995925,667.9483153677921,665.8097506854049,662.0910583052147,658.596603556371,641.8913339455904,656.3022676334083,656.6837719099564,651.947830948303,638.0574495284312,653.6063257414042,649.9967169059314,641.3987746835669,630.1280815548802,619.5249569930911,618.0341649210104,637.7990200214912,623.0320154419867,618.5576168337521,604.7551860548258,628.1640680379568,603.6100875562062,600.8226984858767,617.3683746877609,601.9689627818041,604.9522913082666,600.168461822475,600.6091749385092,602.2229043639135,590.4252299545747,585.3605591136535,581.7914309252066,580.2988379308766,588.8243221010943,576.1774509127217,593.1954360842168,575.0540876611782,579.5083942077348,575.1140581817067,588.9038732729736,580.4868122903699,572.0410613128171,563.2033119702138,565.3244078834642,562.2664722923138,559.2338941846331,549.025425777975,551.1234126863657,600.297619047619,587.4718614718615,595.6043956043956,587.4404761904761,583.8095238095237,577.9961215255333,568.6722464373546,577.2087451332735,581.0119047619048,568.7194624685317,578.0952380952381,561.0714285714286,563.027500897066,561.6666666666666,555.3798352185449,556.2495808182429,572.3809523809524,562.3260073260074,551.8914608388293,553.452380952381,550.4151116878478,541.2554112554112,550.5952380952381,541.9828059264679,530.4613095238095,529.4696969696969,538.4036796536797,532.7777777777778,536.1309523809524,524.968986237643,528.8752052545155,524.4388528138528,519.6953781512606,516.2554112554112,525.530303030303,524.577922077922,518.0699855699856,527.4859943977591,518.3874458874459,513.6904761904763,505.38869322767636,500.55555555555554,497.17261904761904,504.43127048390204,499.6428571428571,500.9642508029604,497.7380952380952,496.78571428571433,489.2836257309942,492.10317460317464,486.6009852216749,488.8095238095238,492.0238095238095,488.900602956667,478.0860805860806,484.16666666666663,484.65659340659334,477.9533941236069,480.89285714285717,472.8571428571429,468.93341952165486,475.95238095238096,465.8333333333333,474.04761904761904,456.8452380952381,468.2261904761904,458.69047619047615,459.6130952380952,469.28571428571433,455.83333333333337,454.8809523809524,462.64797702297705,438.04112554112555,456.1904761904762,458.282967032967,434.2857142857143,461.66666666666663,440.71428571428567,458.4093406593407,446.30952380952385,438.8988095238096,439.4047619047619,463.45238095238096,465.4166666666667,466.54761904761904,471.8452380952381,463.74999999999994,422.85714285714283,456.4880952380952,468.03571428571433,467.08333333333337,466.1309523809524,452.67857142857144,451.7261904761905,463.2738095238095,449.82142857142856,454.2261904761904,447.91666666666663,446.96428571428567,458.5119047619048,445.05952380952385,446.6071428571429,443.1547619047619,442.20238095238096,453.75,423.42261904761904,451.8452380952381,438.3928571428571,428.0654761904762,427.11309523809524,426.1607142857143,447.0833333333333,446.1309523809524,463.92857142857144,414.8511904761905,443.2738095238095,461.07142857142856,441.3690476190476,459.1666666666667,458.2142857142857,426.01190476190476,493.8095238095238,492.8571428571429,435.6547619047619,490.95238095238096,452.5,451.54761904761904,450.5952380952381,487.1428571428571,429.9404761904762,485.23809523809524,428.0357142857143,483.3333333333333,444.8809523809524,481.42857142857144,442.9761904761905,479.5238095238095,441.07142857142856,440.1190476190476,439.16666666666663,475.7142857142857,474.76190476190476,436.3095238095238,472.8571428571429,471.9047619047619,470.95238095238096,470,469.04761904761904,468.0952380952381,467.1428571428571,428.6904761904762,465.23809523809524,464.2857142857143,425.83333333333337,462.3809523809524,461.42857142857144,460.4761904761905,459.5238095238095,458.57142857142856,457.6190476190476,456.66666666666663,455.7142857142857,454.76190476190476,453.8095238095238,452.8571428571429,414.4047619047619,450.95238095238096,450,449.04761904761904,448.0952380952381,447.1428571428571,446.1904761904762,445.23809523809524,444.2857142857143,443.33333333333337,442.3809523809524,441.42857142857144,440.4761904761905,439.5238095238095,438.57142857142856,437.6190476190476,436.66666666666663,435.7142857142857,434.76190476190476,433.8095238095238,432.8571428571429,431.9047619047619,430.95238095238096,430,429.04761904761904,428.0952380952381,427.1428571428571,426.1904761904762,425.23809523809524,424.2857142857143,423.33333333333337,422.3809523809524,421.42857142857144,420.4761904761905,419.5238095238095,418.57142857142856,417.6190476190476,416.66666666666663,415.7142857142857,414.76190476190476,413.8095238095238,412.8571428571429,411.9047619047619,410.95238095238096,410,409.04761904761904,408.0952380952381,407.1428571428571,406.1904761904762,405.23809523809524,404.2857142857143,403.33333333333337,402.3809523809524,401.42857142857144,400.4761904761905,399.5238095238095,398.57142857142856,397.6190476190476,396.66666666666663,395.7142857142857,394.76190476190476,393.8095238095238,392.8571428571429,391.9047619047619,390.95238095238096,390,389.04761904761904,388.0952380952381,387.1428571428571,386.1904761904762,385.23809523809524,384.2857142857143,383.33333333333337,382.3809523809524,381.42857142857144,380.4761904761905,379.5238095238095,378.57142857142856,377.6190476190476,376.66666666666663,375.7142857142857,374.76190476190476,373.8095238095238,372.8571428571429,371.9047619047619,370.95238095238096,370,369.04761904761904,368.0952380952381,367.1428571428571,366.1904761904762,365.23809523809524,364.2857142857143,363.33333333333337,362.3809523809524,361.42857142857144,360.4761904761905,359.5238095238095,358.57142857142856,357.6190476190476,356.66666666666663,355.7142857142857,354.76190476190476,353.8095238095238,352.85714285714283,351.9047619047619,350.95238095238096,350,349.04761904761904,348.0952380952381,347.14285714285717,346.1904761904762,345.23809523809524,344.2857142857143,343.3333333333333,342.3809523809524,341.42857142857144,340.4761904761905,339.5238095238095,338.57142857142856,337.6190476190476,336.6666666666667,335.7142857142857,334.76190476190476,333.8095238095238,332.85714285714283,331.9047619047619,330.95238095238096,330,329.04761904761904,328.0952380952381,327.14285714285717,326.1904761904762,325.23809523809524,324.2857142857143,323.3333333333333,322.3809523809524,321.42857142857144,320.4761904761905,319.5238095238095,318.57142857142856,317.6190476190476,316.6666666666667,315.7142857142857,314.76190476190476,313.8095238095238,312.85714285714283,311.9047619047619,310.95238095238096,310,309.04761904761904,308.0952380952381,307.14285714285717,306.1904761904762,305.23809523809524,304.2857142857143,303.3333333333333,302.3809523809524,301.42857142857144,300.4761904761905,299.5238095238095,298.57142857142856,297.6190476190476,296.6666666666667,295.7142857142857,294.76190476190476,293.8095238095238,292.85714285714283,291.9047619047619,290.95238095238096,290,289.04761904761904,288.0952380952381,287.14285714285717,286.1904761904762,285.23809523809524,284.2857142857143,283.3333333333333,282.3809523809524,281.42857142857144,280.4761904761905,279.5238095238095,278.57142857142856,277.6190476190476,276.6666666666667,275.7142857142857,274.76190476190476,273.8095238095238,272.85714285714283,271.9047619047619,270.95238095238096,270,269.04761904761904,268.0952380952381,267.14285714285717,266.1904761904762,265.23809523809524,264.2857142857143,263.3333333333333,262.3809523809524,261.42857142857144,260.4761904761905,259.5238095238095,258.57142857142856,257.6190476190476,256.6666666666667,255.71428571428572,254.76190476190476,253.8095238095238,252.85714285714283,251.90476190476193,250.95238095238096,250,249.04761904761904,248.09523809523807,247.14285714285717,246.1904761904762,245.23809523809524,244.28571428571428,243.33333333333331,242.3809523809524,241.42857142857144,240.47619047619048,239.52380952380952,238.57142857142856,237.6190476190476,236.66666666666669,235.71428571428572,234.76190476190476,233.8095238095238,232.85714285714283,231.90476190476193,230.95238095238096,230,229.04761904761904,228.09523809523807,227.14285714285717,226.1904761904762,225.23809523809524,224.28571428571428,223.33333333333331,222.3809523809524,221.42857142857144,220.47619047619048,219.52380952380952,218.57142857142856,217.6190476190476,216.66666666666669,215.71428571428572,214.76190476190476,213.8095238095238,212.85714285714283,211.90476190476193,210.95238095238096];
   dataMatrix = new Array(2*data_mat_size);
   for (var j = 0; j < 2*data_mat_size; j++) {
      // 9 degree per quanta
      dataMatrix[j] = fillArrayWithNumber(20, init_jump_freq + 430 * (data_mat_size-j)/data_mat_size);
   }
}

function init_hit_matrix () {
   hitMatrix = new Array(2*data_mat_size);
   for (var j = 0; j < 2*data_mat_size; j++) {
      // 9 degree per quanta
      hitMatrix[j] = fillArrayWithNumber(20, 1);
   }
}

function statsLoop () {
   if (count_average < (ai_freq/mesure_freq)) {
      sum_pos += position;
      count_average++;
   } else {
      avg_pos = sum_pos / count_average;
      $('#avg_pos').text(function(i, oldText) {
       return "avg_pos: ".concat(avg_pos);
    });
      sum_pos = 0;
      count_average = 0;
   };
}

//function CSPL_train (xs, ys) {
//    var ks = new Array();
//    CSPL.getNaturalKs(xs, ys, ks);

//    console.log(JSON.stringify(ks));

//    for (var i = dataMatrix.length - 1; i >= 0; i--) {
//       dataMatrix[i][r] = CSPL.evalSpline(i, xs, ys, ks);
//    };
// }

function AILoop () {
   // Otherwise stay at the same height
   if (takenCareByInterp) {
      // update init_pos by avg_pos so that AI maintains its current height
      // init_pos = avg_pos;
      return;
   };
   var diff = init_pos - avg_pos;
   var amp = 2 * Math.abs(jump);
   var delta = diff > 0 ? Math.exp(diff/amp)-1 : -Math.exp(-diff/amp)+1;

   if (delta < 0) {
      // Speed up, if delta less than deltaMin then pick deltaMin instead
      delta = delta < deltaMin ? deltaMin : delta;
   } else {
      // Slow down, if delta more than deltaMax then pick deltaMax instead
      delta = delta > deltaMax ? deltaMax : delta;
   }

   // init_jump_freq maintains more or less flappy's height
   jump_freq = init_jump_freq + delta > ai_freq*1.5 ? init_jump_freq + delta : ai_freq * 1.5;

   // if (handleJumpTimeout == null) {handleJumpTimeout = setTimeout(jumpAndSet, jump_freq);};

   $('#freq').text(function(i, oldText) {
      return "freq: ".concat(jump_freq);
   });
}

function jumpAndSet () {
   playerJump();

   $('#freq').text(function(i, oldText) {
      return "freq: ".concat(jump_freq);
   });
   handleJumpTimeout = setTimeout(jumpAndSet, jump_freq);
}



// Compat

var isIncompatible = {
   Android: function() {
      return navigator.userAgent.match(/Android/i);
   },
   BlackBerry: function() {
      return navigator.userAgent.match(/BlackBerry/i);
   },
   iOS: function() {
      return navigator.userAgent.match(/iPhone|iPad|iPod/i);
   },
   Opera: function() {
      return navigator.userAgent.match(/Opera Mini/i);
   },
   Safari: function() {
      return (navigator.userAgent.match(/OS X.*Safari/) && ! navigator.userAgent.match(/Chrome/));
   },
   Windows: function() {
      return navigator.userAgent.match(/IEMobile/i);
   },
   any: function() {
      return (isIncompatible.Android() || isIncompatible.BlackBerry() || isIncompatible.iOS() || isIncompatible.Opera() || isIncompatible.Safari() || isIncompatible.Windows());
   }
};
