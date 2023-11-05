const message = document.getElementById('message');
const audio = document.getElementById('audiolol');
const source = document.getElementById('audioSource');

const HalloweenSongs = [
  "../cdn/files/music/Saxobone Zone.ogg",
  "../cdn/files/music/Spook.ogg",
  "../cdn/files/music/Spooky Scary Skeletons.ogg",
  "../cdn/files/music/This Is Halloween.ogg",
];

let shuffledSongs = [];
let currentSongIndex = 0;

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function playNextSong() {
  if (currentSongIndex < shuffledSongs.length) {
    source.src = shuffledSongs[currentSongIndex];
    audio.load();
    audio.play();
    currentSongIndex++;
  } else {
    shuffledSongs = [...HalloweenSongs];
    shuffleArray(shuffledSongs);
    currentSongIndex = 0;
    playNextSong();
  }
}

function handleClick() {
  message.style.display = 'none';
  playNextSong();
}

message.addEventListener('click', handleClick);

shuffledSongs = [...HalloweenSongs];
shuffleArray(shuffledSongs);
playNextSong();

audio.addEventListener('ended', playNextSong);