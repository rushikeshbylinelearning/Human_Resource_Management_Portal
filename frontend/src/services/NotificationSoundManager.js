/**
 * Notification Sound Manager
 * Audio is created on first play so dashboard load does not fetch mp3s.
 */

class NotificationSoundManager {
  constructor() {
    this.announcementSound = null;
    this.generalSound = null;
    this.lastPlayed = 0;
    this.throttleMs = 1000;
    this.isPlaying = false;
  }

  getAnnouncementSound() {
    if (!this.announcementSound) {
      this.announcementSound = new Audio("/sounds/announcement.mp3");
      this.announcementSound.volume = 0.7;
    }
    return this.announcementSound;
  }

  getGeneralSound() {
    if (!this.generalSound) {
      this.generalSound = new Audio("/sounds/notification.mp3");
      this.generalSound.volume = 0.7;
    }
    return this.generalSound;
  }

  async playAnnouncement() {
    return this.playSound(this.getAnnouncementSound(), "announcement");
  }

  async playGeneral() {
    return this.playSound(this.getGeneralSound(), "general");
  }

  async playSound(audio, type) {
    const now = Date.now();

    if (now - this.lastPlayed < this.throttleMs) {
      return false;
    }

    if (this.isPlaying) {
      return false;
    }

    try {
      this.isPlaying = true;
      this.lastPlayed = now;
      audio.currentTime = 0;
      await audio.play();
      audio.onended = () => {
        this.isPlaying = false;
      };
      return true;
    } catch (error) {
      this.isPlaying = false;
      return false;
    }
  }

  setVolume(volume) {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    if (this.announcementSound) this.announcementSound.volume = clampedVolume;
    if (this.generalSound) this.generalSound.volume = clampedVolume;
  }

  preload() {
    this.getAnnouncementSound();
    this.getGeneralSound();
  }

  async testAnnouncement() {
    return this.playAnnouncement();
  }

  async testGeneral() {
    return this.playGeneral();
  }
}

const soundManager = new NotificationSoundManager();

export default soundManager;
