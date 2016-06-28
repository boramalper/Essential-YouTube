'use strict';

/* ===== Configuration ======== */
var API_KEY = null;  // API KEY HERE!
var SEARCH_DELAY = 500;  // in milliseconds
var SLIDER_INTERVAL = 500;  // in ms
var SCROLL_TRIGGER = 300;  // in pixels, before hitting the bottom

/* ============= Global Variables ============= */
var state = "watching";
var player = null;
var videoDuration = null;
var lastKeystroke = null;
var prev_state = null;
var searchResults = {};
var queue = [];
var nextPageToken = null;
var sliderInUse = false;
var isSearching = false;

var autolinker = new Autolinker({twitter: false, hashtag: false});

window.onload = function() {
    if (window.location.href.split("#").length === 2 && window.location.href.split("#")[1].length >= 11)
        loadVideo(window.location.href.split("#")[1]);
    else
        loadVideo('WFxPkhLNrcc');

    setInterval(updateSlider, SLIDER_INTERVAL);

    /* BUGFIX
     *
     * I have no idea why but YouTube's iframe API doesn't always work as documented in the docs in case of
     * `onStateChange` event. So we poll the state of the player every 10 ms.
     *
     * Source:
     *     http://stackoverflow.com/a/17078152/4466589
     *     from https://stackoverflow.com/questions/17078094/youtube-iframe-player-api-onstatechange-not-firing
     */
    setInterval(function() {
        var state = player.getPlayerState();

        if (state != prev_state)
            video_onStateChange();

        prev_state = player.getPlayerState();
    }, 50);
}


function loadVideo(videoId) {
    if (player) {
        player.destroy();
    }

    var page_content = document.getElementsByClassName("page-content")[0];
    page_content.clientWidth;

    player = new YT.Player('player', {
        videoId: videoId,
        width: page_content.clientWidth,
        height: page_content.clientWidth * 9 / 16,
        events: {
          'onReady': video_onReady,
        },
        playerVars: {  // For details: https://developers.google.com/youtube/player_parameters?playerVersion=HTML5
          autohide: 1,
          showinfo: 0,
          disablekb: 1,
          iv_load_policy: 3,
          rel: 0
        }
    });

    var xmlHttp = new XMLHttpRequest();

    xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState != 4 || xmlHttp.status != 200)  // check if it's successfull and completely loaded
            return;

        var response = JSON.parse(xmlHttp.responseText);

        var video_title = document.getElementById("video-title");
        var video_desc = document.getElementById("video-desc");
        var view_count = document.getElementById("view-count");

        video_title.textContent = response.items[0].snippet.title;
        video_desc.innerHTML = autolinker.link(response.items[0].snippet.description.split("\n").join("<br>"));
        view_count.textContent = parseInt(response.items[0].statistics.viewCount).toLocaleString();

        var likes = parseInt(response.items[0].statistics.likeCount);
        var dislikes = parseInt(response.items[0].statistics.dislikeCount);

        document.getElementById("like-dislike").MaterialProgress.setProgress(likes * 100 / (likes + dislikes));

        var tabTitle = document.getElementsByTagName("title")[0];
        tabTitle.textContent = response.items[0].snippet.title + " - EssentialYouTube";

        var slider = document.getElementById("slider");
        slider.setAttribute("max", parseDuration(response.items[0].contentDetails.duration));
        slider.value = 0;

        window.location.href = window.location.href.split("#")[0] + "#" + videoId;
    };

    xmlHttp.open("GET", "https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=" + videoId + "&key=" + API_KEY, true);
    xmlHttp.send(null);
}


function nextVideo() {
    if (queue.length) {
        loadVideo(queue.shift().id.videoId);
        refreshQueue();
    }
    else {
        player.stopVideo();
        updateSlider();
    }
}


function updateSlider() {
    if (sliderInUse)
        return;

    var slider = document.getElementById("slider");
    slider.MaterialSlider.change(player.getCurrentTime());
}


function enterSearch() {
    if (state === "searching")
        return;

    var player_container = document.getElementById("player-container");
    var controllers = document.getElementById("controllers");
    var video_info = document.getElementById("info");
    var search_results = document.getElementById("search-results");

    player_container.classList.add("hidden");
    video_info.classList.add("hidden");
    controllers.classList.remove("hidden");
    search_results.classList.remove("hidden");

    state = "searching";
}


function exitSearch() {
    if (state === "watching")
        return;

    var player_container = document.getElementById("player-container");
    var controllers = document.getElementById("controllers");
    var video_info = document.getElementById("info");
    var search_results = document.getElementById("search-results");

    search_results.classList.add("hidden");
    controllers.classList.add("hidden");
    player_container.classList.remove("hidden");
    video_info.classList.remove("hidden");

    state = "watching";
}


function search(nodelay, nextPage) {
    var date = new Date();

    if (!nodelay && date.getTime() - lastKeystroke < SEARCH_DELAY)
        return;

    if (isSearching)
        return;

    isSearching = true;

    var search_i = document.getElementById("search");

    var xmlHttp = new XMLHttpRequest();

    var url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&q=' + search_i.value + '&type=video&maxResults=10&key=' + API_KEY;
    if (nextPage && nextPageToken)
        url += '&pageToken=' + nextPageToken;

    xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState != 4 || xmlHttp.status != 200)  // check if it's successfull and completely loaded
            return;

        var response = JSON.parse(xmlHttp.responseText);

        nextPageToken = response.nextPageToken;

        for (var i=0; i < response.items.length; ++i) {
            var item = response.items[i];

            searchResults[item.id.videoId] = item;
        }

        refreshSearchResults();
        isSearching = false;
    };
    
    xmlHttp.open('GET', url, true);
    xmlHttp.send(null);

    if (!nextPage)
        searchResults = {};
}

function refreshSearchResults() {
    var searchResultTemplate = "" +
        '<li class="mdl-list__item">' +
          '<div class="mdl-card mdl-shadow--2dp">' +
            '<div class="mdl-card__title">' +
              '<h3 class="mdl-card__title-text">' +
                '<a href="#" onclick="video_title_onClick(\'{videoID}\')">{title}</a>' +
              '</h3>' +
            '</div>' +
            '<div class="mdl-card__menu">' +
              '<button class="mdl-button mdl-button--icon mdl-js-button" onclick="add_onClick(\'{videoID}\')" title="Add to queue">' +
                '<i class="material-icons">playlist_add</i>' +
              '</button>' +
            '</div>' +
            '<div class="entry-details">' +
              '<div>' +
                '<a href="#" onclick="thumbnail_onClick(\'{videoID}\')">' +
                  '<img src="{thumbnailURL}">' +
                '</a>' +
              '</div>' +
              '<div class="mdl-card__supporting-text">' +
                '{description}' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</li>';

    var search_results = document.getElementById("search-results");

    search_results.innerHTML = '';

    for (var itemID in searchResults) {
        var item = searchResults[itemID];

        search_results.innerHTML += searchResultTemplate.supplant({videoID: item.id.videoId,
                                                                   title: item.snippet.title,
                                                                   thumbnailURL: item.snippet.thumbnails.high.url,
                                                                   description: autolinker.link(item.snippet.description)
                                                               });
    }
}


function refreshQueue() {
    var FIRST_ENTRY_TEMPLATE = '<li class="mdl-list__item">' +
                                 '<div class="mdl-card mdl-shadow--2dp">' +
                                   '<div class="mdl-card__title">' +
                                     '<h3 class="mdl-card__title-text">'+
                                       '<a href="#" onclick="queue_title_onClick()">Next</a>' +
                                     '</h3>' +
                                   '</div>' +
                                   '<div class="mdl-card__menu">' +
                                     '<button class="mdl-button mdl-button--icon mdl-js-button" onclick="downward_onClick(\'{pos}\')" disabled>' +
                                       '<i class="material-icons">arrow_upward</i>' +
                                     '</button>' +
                                     '<button class="mdl-button mdl-button--icon mdl-js-button" onclick="downward_onClick(\'{pos}\')" title="Move downwards in queue">' +
                                       '<i class="material-icons">arrow_downward</i>' +
                                     '</button>' +
                                     '<button class="mdl-button mdl-button--icon mdl-js-button" onclick="remove_onClick(\'{pos}\')" title="Remove from queue">' +
                                       '<i class="material-icons">remove</i>' +
                                     '</button>' +
                                   '</div>' +
                                   '<div class="entry-details">' +
                                     '<div>' +
                                       '<a href="#" onclick="queue_thumbnail_onClick()"><img src="{thumbnailURL}"></a>' +
                                     '</div>' +
                                     '<div class="mdl-card__supporting-text">' +
                                       '{title}' +
                                     '</div>' +
                                   '</div>' +
                                 '</div>' +
                               '</li>';

    var CONSEQ_ENTRY_TEMPLATE = '<li class="mdl-list__item">' +
                                  '<div class="mdl-card mdl-shadow--2dp">' +
                                    '<div class="mdl-card__supporting-text">' +
                                      '{title}' +
                                    '</div>' +
                                    '<div class="mdl-card__menu">' +
                                      '<button class="mdl-button mdl-button--icon mdl-js-button" onclick="upward_onClick(\'{pos}\')" title="Remove from queue">' +
                                        '<i class="material-icons">arrow_upward</i>' +
                                      '</button>' +
                                      '<button class="mdl-button mdl-button--icon mdl-js-button" onclick="downward_onClick(\'{pos}\')" title="Move downwards in queue" {isDisabled}>' +
                                        '<i class="material-icons">arrow_downward</i>' +
                                      '</button>' +
                                      '<button class="mdl-button mdl-button--icon mdl-js-button" onclick="remove_onClick(\'{pos}\')" title="Move upwards in queue">' +
                                        '<i class="material-icons">remove</i>' +
                                      '</button>' +
                                    '</div>' +
                                  '</div>' +
                                '</li>';

    var queue_list = document.getElementById("queue");

    // delete all the entries
    while (queue_list.lastChild) {
        queue_list.removeChild(queue_list.lastChild);
    }

    // create the first entry
    if (queue.length) {
        queue_list.innerHTML = FIRST_ENTRY_TEMPLATE.supplant({title: queue[0].snippet.title,
                                                              thumbnailURL: queue[0].snippet.thumbnails.high.url,
                                                              pos: 0});
    }

    // create rest of the entries
    for (var i=1; i < queue.length; ++i) {
        queue_list.innerHTML += CONSEQ_ENTRY_TEMPLATE.supplant({title: queue[i].snippet.title,
                                                                pos: i,
                                                                isDisabled: i == queue.length - 1 ? "disabled" : ""});
    }
}

/* ==================================================== CALLBACKS =================================================== */
function header_title_onClick() {
    document.getElementsByTagName("main")[0].scrollTop = 0;
}


function video_title_onClick(videoID) {
    exitSearch();
    loadVideo(videoID);
}


function add_onClick(id) {
    queue.push(searchResults[id]);
    refreshQueue();
}

function queue_thumbnail_onClick() {
    nextVideo();
}

function queue_title_onClick() {
    nextVideo();
}

function thumbnail_onClick(videoID) {
    exitSearch();
    loadVideo(videoID);
}

function close_onClick() {
    exitSearch();
}

function main_onScroll(main) {
    if (state === "searching" && main.scrollTop + main.clientHeight + SCROLL_TRIGGER >= main.scrollHeight)
        search(true, true);
}

function search_onInput(input_e) {
    if (input_e.value.length === 0) {
        exitSearch();
    }
    else {
        enterSearch();

        var date = new Date();
        lastKeystroke = date.getTime();

        setTimeout(search, SEARCH_DELAY);
    }
}


function search_onKeydown(event) {
    if (event.keyCode == 13) {  // if enter is pressed
        enterSearch();
        search(true);
    }
}

function search_onClick(search_i) {
    if (search_i.value.length) {
        enterSearch();

        if (Object.keys(searchResults).length)
            refreshSearchResults();
        else
            search(true);
    }
}


function slider_onChange(slider) {
    player.seekTo(slider.value, true);
}


function slider_onMousedown() {
    sliderInUse = true;
}


function slider_onMouseup() {
    sliderInUse = false;
}


function remove_onClick(pos) {
    queue.splice(pos, 1);
    refreshQueue();
}


function upward_onClick(pos) {
    pos = parseInt(pos);
    queue.splice(pos - 1, 0, queue.splice(pos, 1)[0]);
    refreshQueue();
}


function downward_onClick(pos) {
    pos = parseInt(pos);
    queue.splice(pos + 1, 0, queue.splice(pos, 1)[0]);
    refreshQueue();
}


function playPause_onClick() {
    if (player.getPlayerState() === YT.PlayerState.PLAYING) {
        player.pauseVideo();
    }
    else {
        player.playVideo();
    }
}


function volume_onClick(pp_btn) {
    if (player.isMuted()) {
        pp_btn.innerHTML = '<i class="material-icons">volume_up</i>';
        player.unMute();
    }
    else {
        player.mute();
        pp_btn.innerHTML = '<i class="material-icons">volume_off</i>';
    }
}

function video_onStateChange() {
    var pp_btn = document.getElementById("play-pause");

    if (player.getPlayerState() === YT.PlayerState.ENDED) {
        if (document.getElementById("loopSwitch").checked) {
            player.seekTo(0, true);
            player.playVideo();
        }
        else {
            pp_btn.innerHTML = '<i class="material-icons">play_arrow</i>';
            nextVideo();
        }
    }
    else if (player.getPlayerState() === YT.PlayerState.PLAYING) {
        pp_btn.innerHTML = '<i class="material-icons">pause</i>';
    }
    else {
        pp_btn.innerHTML = '<i class="material-icons">play_arrow</i>';
    }
}


function video_onReady(event) {
    event.target.playVideo();
}

function next_onClick() {
    nextVideo();
}

/* ==================================================== UTILITIES =================================================== */
// http://javascript.crockford.com/remedial.html
if (!String.prototype.supplant) {
    String.prototype.supplant = function (o) {
        return this.replace(
            /\{([^{}]*)\}/g,
            function (a, b) {
                var r = o[b];
                return typeof r === 'string' || typeof r === 'number' ? r : a;
            }
        );
    };
}

// http://stackoverflow.com/a/25209563
function parseDuration(duration) {
    var matches = duration.match(/[0-9]+[HMS]/g);

    var seconds = 0;

    matches.forEach(function (part) {
        var unit = part.charAt(part.length-1);
        var amount = parseInt(part.slice(0,-1));

        switch (unit) {
            case 'H':
                seconds += amount * 60 * 60;
                break;
            case 'M':
                seconds += amount * 60;
                break;
            case 'S':
                seconds += amount;
                break;
            default:
        }
    });

    return seconds;
}