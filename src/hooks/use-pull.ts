import { onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useFlvPlay, useHlsPlay } from '@/hooks/use-play';
import { useSrsWs } from '@/hooks/use-srs-ws';
import {
  DanmuMsgTypeEnum,
  IDanmu,
  ILiveRoom,
  IMessage,
  LiveLineEnum,
  LiveRoomTypeEnum,
} from '@/interface';
import { WsMsgTypeEnum } from '@/network/webSocket';
import { useAppStore } from '@/store/app';
import { useNetworkStore } from '@/store/network';
import { useUserStore } from '@/store/user';
import { createVideo, videoToCanvas } from '@/utils';

export function usePull() {
  const route = useRoute();
  const userStore = useUserStore();
  const networkStore = useNetworkStore();
  const appStore = useAppStore();
  const roomId = ref(route.params.roomId as string);
  const localStream = ref<MediaStream>();
  const danmuStr = ref('');
  const autoplayVal = ref(false);
  const videoLoading = ref(false);
  const flvurl = ref('');
  const hlsurl = ref('');
  const sidebarList = ref<
    {
      socketId: string;
    }[]
  >([]);
  const videoElArr = ref<HTMLVideoElement[]>([]);
  const remoteVideo = ref<HTMLElement[]>([]);
  const {
    isPull,
    mySocketId,
    initSrsWs,
    roomLiving,
    anchorInfo,
    liveUserList,
    damuList,
  } = useSrsWs();
  isPull.value = true;
  const { flvVideoEl, startFlvPlay, destroyFlv } = useFlvPlay();
  const { hlsVideoEl, startHlsPlay, destroyHls } = useHlsPlay();
  const stopDrawingArr = ref<any[]>([]);

  onUnmounted(() => {
    handleStopDrawing();
  });

  function handleStopDrawing() {
    destroyFlv();
    destroyHls();
    stopDrawingArr.value.forEach((cb) => cb());
    stopDrawingArr.value = [];
    remoteVideo.value.forEach((el) => el.remove());
    remoteVideo.value = [];
  }

  watch(hlsVideoEl, () => {
    stopDrawingArr.value = [];
    stopDrawingArr.value.forEach((cb) => cb());
    const { canvas, stopDrawing } = videoToCanvas({
      videoEl: hlsVideoEl.value!,
    });
    stopDrawingArr.value.push(stopDrawing);
    remoteVideo.value.push(canvas);
    videoLoading.value = false;
  });

  function handleHlsPlay(url?: string) {
    console.log('handleHlsPlay', url);
    handleStopDrawing();
    videoLoading.value = true;
    appStore.setLiveLine(LiveLineEnum.hls);
    startHlsPlay({
      hlsurl: url || hlsurl.value,
    });
  }

  watch(flvVideoEl, () => {
    stopDrawingArr.value = [];
    stopDrawingArr.value.forEach((cb) => cb());
    const { canvas, stopDrawing } = videoToCanvas({
      videoEl: flvVideoEl.value!,
    });
    stopDrawingArr.value.push(stopDrawing);
    remoteVideo.value.push(canvas);
    videoLoading.value = false;
  });

  function handleFlvPlay() {
    console.log('handleFlvPlay');
    handleStopDrawing();
    videoLoading.value = true;
    appStore.setLiveLine(LiveLineEnum.flv);
    startFlvPlay({
      flvurl: flvurl.value,
    });
  }

  function handlePlay(data: ILiveRoom) {
    console.warn('handlePlay');
    roomLiving.value = true;
    appStore.setLiveRoomInfo(data);
    flvurl.value = data.flv_url!;
    hlsurl.value = data.hls_url!;
    switch (data.type) {
      case LiveRoomTypeEnum.user_srs:
        handleHlsPlay(data.hls_url);
        break;
      case LiveRoomTypeEnum.user_obs:
        handleHlsPlay(data.hls_url);
        break;
      case LiveRoomTypeEnum.system:
        handleHlsPlay(data.hls_url);
        break;
      case LiveRoomTypeEnum.user_wertc:
        appStore.setLiveLine(LiveLineEnum.rtc);
        break;
    }
  }

  watch(
    () => roomLiving.value,
    (val) => {
      if (val) {
        if (appStore.liveRoomInfo?.type !== LiveRoomTypeEnum.user_wertc) {
          handlePlay(appStore.liveRoomInfo!);
        }
      } else {
        closeRtc();
        handleStopDrawing();
      }
    }
  );

  watch(
    () => appStore.liveLine,
    (newVal) => {
      console.log('liveLine变了', newVal);
      if (!roomLiving.value) {
        return;
      }
      switch (newVal) {
        case LiveLineEnum.flv:
          handleFlvPlay();
          break;
        case LiveLineEnum.hls:
          handleHlsPlay();
          break;
        case LiveLineEnum.rtc:
          break;
      }
    }
  );
  watch(
    () => appStore.muted,
    (newVal) => {
      console.log('muted变了', newVal);
      videoElArr.value.forEach((el) => {
        el.muted = newVal;
      });
    }
  );

  watch(
    () => networkStore.rtcMap,
    (newVal) => {
      if (appStore.liveRoomInfo?.type === LiveRoomTypeEnum.user_wertc) {
        newVal.forEach((item) => {
          videoLoading.value = false;
          const { canvas } = videoToCanvas({
            videoEl: item.videoEl,
          });
          videoElArr.value.push(item.videoEl);
          remoteVideo.value.push(canvas);
        });
      }
    },
    {
      deep: true,
      immediate: true,
    }
  );

  watch(
    () => localStream.value,
    (val) => {
      if (val) {
        console.log('localStream变了');
        console.log('音频轨：', val?.getAudioTracks());
        console.log('视频轨：', val?.getVideoTracks());
        if (appStore.liveRoomInfo?.type === LiveRoomTypeEnum.user_wertc) {
          videoElArr.value.forEach((dom) => {
            dom.remove();
          });
          val?.getVideoTracks().forEach((track) => {
            console.log('视频轨enabled：', track.id, track.enabled);
            const video = createVideo({});
            video.setAttribute('track-id', track.id);
            video.srcObject = new MediaStream([track]);
            remoteVideo.value.push(video);
            videoElArr.value.push(video);
          });
          val?.getAudioTracks().forEach((track) => {
            console.log('音频轨enabled：', track.id, track.enabled);
            const video = createVideo({});
            video.setAttribute('track-id', track.id);
            video.srcObject = new MediaStream([track]);
            remoteVideo.value.push(video);
            videoElArr.value.push(video);
          });
          videoLoading.value = false;
        } else {
          videoElArr.value.forEach((dom) => {
            dom.remove();
          });
          val?.getVideoTracks().forEach((track) => {
            console.log('视频轨enabled：', track.id, track.enabled);
            const video = createVideo({});
            video.setAttribute('track-id', track.id);
            video.srcObject = new MediaStream([track]);
            remoteVideo.value.push(video);
            videoElArr.value.push(video);
          });
          val?.getAudioTracks().forEach((track) => {
            console.log('音频轨enabled：', track.id, track.enabled);
            const video = createVideo({});
            video.setAttribute('track-id', track.id);
            video.srcObject = new MediaStream([track]);
            remoteVideo.value.push(video);
            videoElArr.value.push(video);
          });
          videoLoading.value = false;
        }
      } else {
        videoElArr.value?.forEach((item) => {
          item.remove();
        });
      }
    },
    { deep: true }
  );

  watch(
    [
      () => userStore.userInfo,
      () => networkStore.wsMap.get(roomId.value)?.socketIo?.connected,
    ],
    ([userInfo, connected]) => {
      if (userInfo && connected) {
        const instance = networkStore.wsMap.get(roomId.value);
        if (!instance) return;
      }
    }
  );

  function initPull(autolay = true) {
    autoplayVal.value = autolay;
    if (autoplayVal.value) {
      videoLoading.value = true;
    }
    initSrsWs({
      roomId: roomId.value,
      isAnchor: false,
    });
  }

  function closeWs() {
    const instance = networkStore.wsMap.get(roomId.value);
    instance?.close();
  }

  function closeRtc() {
    networkStore.rtcMap.forEach((rtc) => {
      rtc.close();
      networkStore.removeRtc(rtc.roomId);
    });
  }

  function addVideo() {
    sidebarList.value.push({ socketId: mySocketId.value });
    // nextTick(() => {
    //   liveUserList.value.forEach((item) => {
    //     const socketId = item.id;
    //     if (socketId === mySocketId.value) {
    //       remoteVideoRef.value[mySocketId.value].srcObject = localStream.value;
    //     }
    //   });
    // });
  }

  function keydownDanmu(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (key === 'enter') {
      event.preventDefault();
      sendDanmu();
    }
  }

  function sendDanmu() {
    if (!danmuStr.value.trim().length) {
      window.$message.warning('请输入弹幕内容！');
      return;
    }
    const instance = networkStore.wsMap.get(roomId.value);
    if (!instance) return;
    const danmu: IDanmu = {
      socket_id: mySocketId.value,
      userInfo: userStore.userInfo,
      msgType: DanmuMsgTypeEnum.danmu,
      msg: danmuStr.value,
    };
    const messageData: IMessage['data'] = {
      msg: danmuStr.value,
      msgType: DanmuMsgTypeEnum.danmu,
      live_room_id: Number(roomId.value),
    };
    instance.send({
      msgType: WsMsgTypeEnum.message,
      data: messageData,
    });
    damuList.value.push(danmu);
    danmuStr.value = '';
  }

  return {
    handlePlay,
    handleStopDrawing,
    initPull,
    closeWs,
    closeRtc,
    mySocketId,
    keydownDanmu,
    sendDanmu,
    addVideo,
    remoteVideo,
    roomLiving,
    autoplayVal,
    videoLoading,
    damuList,
    liveUserList,
    sidebarList,
    danmuStr,
    anchorInfo,
  };
}
