import React, {useEffect, useState, useRef, useCallback} from 'react';
import {
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  View,
  Text,
  TouchableOpacity,
  Alert,
} from 'react-native';
import TextInputContainer from './src/components/TextInputContainer';
import CallAnswer from './src/components/CallAnswer';
import CallEnd from './src/components/CallEnd';
import SocketIOClient from 'socket.io-client'; // import socket io
// import WebRTC
import {
  mediaDevices,
  RTCPeerConnection,
  RTCView,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
import CameraSwitch from './src/components/CameraSwitch';
import VideoOff from './src/components/VideoOff';
import VideoOn from './src/components/VideoOn';
import IconContainer from './src/components/IconContainer';
import MicOff from './src/components/MicOff';
import MicOn from './src/components/MicOn';
import InCallManager from 'react-native-incall-manager';

export default function App({}) {
  const [type, setType] = useState('JOIN');

  const [callerId] = useState(
    Math.floor(100000 + Math.random() * 900000).toString(),
  );

  const [otherUserId, setOtherUserId] = useState(null);
  // Stream of local user
  const [localStream, setlocalStream] = useState(null);

  /* When a call is connected, the video stream from the receiver is appended to this state in the stream*/
  const [remoteStream, setRemoteStream] = useState(null);
  // Handling Mic status
  const [localMicOn, setlocalMicOn] = useState(true);

  // Handling Camera status
  const [localWebcamOn, setlocalWebcamOn] = useState(true);
  let remoteRTCMessage = useRef(null);

  // This establishes your WebSocket connection
  const socket = SocketIOClient('https://ssd0h6st-3500.inc1.devtunnels.ms/', {
    //https://health-care-server-sooty.vercel.app
    transports: ['websocket'],
    query: {
      callerId,
      /* We have generated this `callerId` in `JoinScreen` implementation */
    },
  });

  /* This creates an WebRTC Peer Connection, which will be used to set local/remote descriptions and offers. */
  const peerConnection = useRef(
    new RTCPeerConnection({
      iceServers: [
        {
          urls: [
            'stun:meet-jit-si-turnrelay.jitsi.net:443',
            'stun:stun.l.google.com:19302',
            'stun:global.stun.twilio.com:3478',
          ],
        },
        // {
        //   urls: 'stun:stun.l.google.com:19302',
        // },
        // {
        //   urls: 'stun:stun1.l.google.com:19302',
        // },
        // {
        //   urls: 'stun:stun2.l.google.com:19302',
        // },
      ],
    }),
  );

  const handleNegoNeeded = useCallback(async () => {
    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(
      new RTCSessionDescription(offer),
    );
    socket.emit('peer:nego:needed', {offer, to: otherUserId});
  }, [socket]);

  const handleNegoNeedIncomming = useCallback(
    async ({from, offer}) => {
      await peerConnection.current.setRemoteDescription(offer);
      const ans = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(
        new RTCSessionDescription(ans),
      );
      socket.emit('peer:nego:done', {to: from, ans});
    },
    [socket],
  );

  const handleNegoNeedFinal = useCallback(async ({ans}) => {
    await peerConnection.current.setRemoteDescription(
      new RTCSessionDescription(ans),
    );
  }, []);
  useEffect(() => {
    peerConnection.current.addEventListener('track', async ev => {
      let streams = ev.streams;
      console.log('GOT TRACKS!!', streams[0]);
      setRemoteStream(streams[0]);
    });
  }, []);

  useEffect(() => {
    peerConnection.current.addEventListener(
      'negotiationneeded',
      handleNegoNeeded,
    );
    return () => {
      peerConnection.current.removeEventListener(
        'negotiationneeded',
        handleNegoNeeded,
      );
    };
  }, [handleNegoNeeded]);

  useEffect(() => {
    socket.on('newCall', data => {
      /* This event occurs whenever any peer wishes to establish a call with you. */
      remoteRTCMessage.current = data.rtcMessage;
      // otherUserId.current = data.callerId;
      setOtherUserId(data.callerId);
      setType('INCOMING_CALL');
    });
    socket.on('endCall', data => {
      leave();
    });

    socket.on('callAnswered', data => {
      /* This event occurs whenever remote peer accept the call. */
      remoteRTCMessage.current = data.rtcMessage;
      peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(remoteRTCMessage.current),
      );
      setType('WEBRTC_ROOM');
    });

    socket.on('ICEcandidate', data => {
      /* This event is for exchangin Candidates. */
      let message = data.rtcMessage;
      console.log('🚀 ~ useEffect ~ data:', data);

      // When Bob gets a candidate message from Alice, he calls `addIceCandidate` to add the candidate to the remote peer description.

      if (peerConnection.current) {
        peerConnection?.current
          .addIceCandidate(
            new RTCIceCandidate({
              candidate: message.candidate,
              sdpMid: message.id,
              sdpMLineIndex: message.label,
            }),
          )
          .then(data => {
            console.log('SUCCESS');
          })
          .catch(err => {
            console.log('Error', err);
          });
      }
    });
    socket.on('peer:nego:needed', handleNegoNeedIncomming);
    socket.on('peer:nego:final', handleNegoNeedFinal);

    let isFront = false;

    /*The MediaDevices interface allows you to access connected media inputs such as cameras and microphones. We ask the user for permission to access those media inputs by invoking the mediaDevices.getUserMedia() method. */
    mediaDevices.enumerateDevices().then(sourceInfos => {
      let videoSourceId;
      for (let i = 0; i < sourceInfos.length; i++) {
        const sourceInfo = sourceInfos[i];
        if (
          sourceInfo.kind == 'videoinput' &&
          sourceInfo.facing == (isFront ? 'user' : 'environment')
        ) {
          videoSourceId = sourceInfo.deviceId;
        }
      }

      mediaDevices
        .getUserMedia({
          audio: true,
          video: {
            mandatory: {
              minWidth: 500, // Provide your own width, height and frame rate here
              minHeight: 300,
              minFrameRate: 30,
            },
            facingMode: isFront ? 'user' : 'environment',
            optional: videoSourceId ? [{sourceId: videoSourceId}] : [],
          },
        })
        .then(stream => {
          // Get local stream!
          setlocalStream(stream);
          // console.log('gty');
          // setup stream listening
          // peerConnection.current.addStream(stream);
          stream.getTracks().forEach(track => {
            console.log('🚀 ~ stream.getTracks ~ track:', track);
            peerConnection.current.addTrack(track, stream);
          });
          // peerConnection.current.addTrack(stream);
        })
        .catch(error => {
          // Log error
        });
    });

    // peerConnection.current.ontrack = event => {
    //   console.log('🚀 ~ useEffect ~ event.stream:', event.streams[0]);
    //   setRemoteStream(event.streams[0]);
    // };

    // Setup ice handling
    peerConnection.current.onicecandidate = event => {
      console.log('End of candidates. 0');
      if (event.candidate) {
        console.log('End of candidates. 1');
        // Alice sends serialized candidate data to Bob using Socket
        sendICEcandidate({
          calleeId: otherUserId,
          rtcMessage: {
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate,
          },
        });
      } else {
        console.log('End of candidates.');
      }
    };

    return () => {
      socket.off('newCall');
      socket.off('callAnswered');
      socket.off('ICEcandidate');
      socket.off('callEnd');
      socket.on('peer:nego:needed');
      socket.on('peer:nego:final');
    };
  }, []);
  useEffect(() => {
    InCallManager.start();
    InCallManager.setKeepScreenOn(true);
    InCallManager.setForceSpeakerphoneOn(true);

    return () => {
      InCallManager.stop();
    };
  }, []);

  function sendICEcandidate(data) {
    socket.emit('ICEcandidate', data);
  }
  async function processCall() {
    if (otherUserId === callerId) {
      Alert.alert('Failed', "You can't call your self");
      return;
    }
    // peerConnection.current = new RTCPeerConnection({
    //   iceServers: [
    //     {
    //       urls: 'stun:stun.l.google.com:19302',
    //     },
    //     {
    //       urls: 'stun:stun1.l.google.com:19302',
    //     },
    //     {
    //       urls: 'stun:stun2.l.google.com:19302',
    //     },
    //   ],
    // });
    // 1. Alice runs the `createOffer` method for getting SDP.
    const sessionDescription = await peerConnection.current.createOffer();
    console.log('peer con');

    // 2. Alice sets the local description using `setLocalDescription`.
    await peerConnection.current.setLocalDescription(sessionDescription);

    // 3. Send this session description to Bob uisng socket
    sendCall({
      calleeId: otherUserId,
      rtcMessage: sessionDescription,
    });
  }

  async function processAccept() {
    // peerConnection.current = new RTCPeerConnection({
    //   iceServers: [
    //     {
    //       urls: 'stun:stun.l.google.com:19302',
    //     },
    //     {
    //       urls: 'stun:stun1.l.google.com:19302',
    //     },
    //     {
    //       urls: 'stun:stun2.l.google.com:19302',
    //     },
    //   ],
    // });
    // 4. Bob sets the description, Alice sent him as the remote description using `setRemoteDescription()`
    peerConnection.current.setRemoteDescription(
      new RTCSessionDescription(remoteRTCMessage.current),
    );

    // 5. Bob runs the `createAnswer` method
    const sessionDescription = await peerConnection.current.createAnswer();

    // 6. Bob sets that as the local description and sends it to Alice
    await peerConnection.current.setLocalDescription(sessionDescription);
    answerCall({
      callerId: otherUserId,
      rtcMessage: sessionDescription,
    });
  }

  function answerCall(data) {
    socket.emit('answerCall', data);
  }

  function sendCall(data) {
    console.log('sendcall');
    socket.emit('call', data);
  }
  function endCall(data) {
    console.log('🚀 ~ endCall ~ data:', data);
    socket.emit('endCall', {callerId: data, message: 'Call Ended'});
    leave();
  }
  // Switch Camera
  function switchCamera() {
    localStream.getVideoTracks().forEach(track => {
      track._switchCamera();
    });
  }

  // Enable/Disable Camera
  function toggleCamera() {
    localWebcamOn ? setlocalWebcamOn(false) : setlocalWebcamOn(true);
    localStream.getVideoTracks().forEach(track => {
      localWebcamOn ? (track.enabled = false) : (track.enabled = true);
    });
  }

  // Enable/Disable Mic
  function toggleMic() {
    localMicOn ? setlocalMicOn(false) : setlocalMicOn(true);
    localStream.getAudioTracks().forEach(track => {
      localMicOn ? (track.enabled = false) : (track.enabled = true);
    });
  }

  // Destroy WebRTC Connection
  function leave() {
    console.log('hellow');
    peerConnection.current.close();
    setlocalStream(null);
    // otherUserId.current = null;
    setOtherUserId(null);
    setType('JOIN');
  }

  const JoinScreen = () => {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{
          flex: 1,
          backgroundColor: '#050A0E',
          justifyContent: 'center',
          paddingHorizontal: 42,
        }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <>
            <View
              style={{
                padding: 35,
                backgroundColor: '#1A1C22',
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: 14,
              }}>
              <Text
                style={{
                  fontSize: 18,
                  color: '#D0D4DD',
                }}>
                Your Caller ID
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  marginTop: 12,
                  alignItems: 'center',
                }}>
                <Text
                  style={{
                    fontSize: 32,
                    color: '#ffff',
                    letterSpacing: 6,
                  }}>
                  {callerId}
                </Text>
              </View>
            </View>

            <View
              style={{
                backgroundColor: '#1A1C22',
                padding: 40,
                marginTop: 25,
                justifyContent: 'center',
                borderRadius: 14,
              }}>
              <Text
                style={{
                  fontSize: 18,
                  color: '#D0D4DD',
                }}>
                Enter call id of another user
              </Text>
              <TextInputContainer
                placeholder={'Enter Caller ID'}
                value={otherUserId}
                setValue={text => {
                  // otherUserId.current = text;
                  setOtherUserId(text);
                }}
                keyboardType={'number-pad'}
              />
              <TouchableOpacity
                onPress={async () => {
                  await processCall();
                  setType('OUTGOING_CALL');
                }}
                style={{
                  height: 50,
                  backgroundColor: '#5568FE',
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderRadius: 12,
                  marginTop: 16,
                }}>
                <Text
                  style={{
                    fontSize: 16,
                    color: '#FFFFFF',
                  }}>
                  Call Now
                </Text>
              </TouchableOpacity>
            </View>
          </>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    );
  };

  const OutgoingCallScreen = () => {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'space-around',
          backgroundColor: '#050A0E',
        }}>
        <View
          style={{
            padding: 35,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 14,
          }}>
          <Text
            style={{
              fontSize: 16,
              color: '#D0D4DD',
            }}>
            Calling to...
          </Text>

          <Text
            style={{
              fontSize: 36,
              marginTop: 12,
              color: '#ffff',
              letterSpacing: 6,
            }}>
            {otherUserId}
          </Text>
        </View>
        <View
          style={{
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <TouchableOpacity
            onPress={() => {
              // setType('JOIN');
              // otherUserId.current = null;
              // setOtherUserId(null);
              console.log('otheruserid:', otherUserId);
              endCall(otherUserId);
            }}
            style={{
              backgroundColor: '#FF5D5D',
              borderRadius: 30,
              height: 60,
              aspectRatio: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
            <CallEnd width={50} height={12} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const IncomingCallScreen = () => {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'space-around',
          backgroundColor: '#050A0E',
        }}>
        <View
          style={{
            padding: 35,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 14,
          }}>
          <Text
            style={{
              fontSize: 36,
              marginTop: 12,
              color: '#ffff',
            }}>
            {otherUserId} is calling..
          </Text>
        </View>
        <View
          style={{
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <TouchableOpacity
            onPress={() => {
              processAccept();
              setType('WEBRTC_ROOM');
            }}
            style={{
              backgroundColor: 'green',
              borderRadius: 30,
              height: 60,
              aspectRatio: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
            <CallAnswer height={28} fill={'#fff'} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  const WebrtcRoomScreen = () => {
    console.log(
      '🚀 ~ WebrtcRoomScreen ~ remoteStream:',
      JSON.stringify(remoteStream),
    );
    console.log(
      '🚀 ~ WebrtcRoomScreen ~ localStream:',
      JSON.stringify(localStream),
    );
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#050A0E',
          paddingHorizontal: 12,
          paddingVertical: 12,
        }}>
        {localStream ? (
          <RTCView
            objectFit={'cover'}
            style={{flex: 1, backgroundColor: '#050A0E'}}
            streamURL={localStream.toURL()}
          />
        ) : null}
        {remoteStream && (
          <RTCView
            objectFit={'cover'}
            style={{
              flex: 1,
              backgroundColor: '#050A0E',
              marginTop: 8,
            }}
            streamURL={remoteStream.toURL()}
          />
        )}
        <View
          style={{
            marginVertical: 12,
            flexDirection: 'row',
            justifyContent: 'space-evenly',
          }}>
          <IconContainer
            backgroundColor={'red'}
            onPress={() => {
              // leave();
              endCall(otherUserId);
              setlocalStream(null);
            }}
            Icon={() => {
              return (
                <CallEnd
                  height={26}
                  width={26}
                  fill="#FFF"
                  onPress={() => endCall(otherUserId)}
                />
              );
            }}
          />
          <IconContainer
            style={{
              borderWidth: 1.5,
              borderColor: '#2B3034',
            }}
            backgroundColor={!localMicOn ? '#fff' : 'transparent'}
            onPress={() => {
              toggleMic();
            }}
            Icon={() => {
              return localMicOn ? (
                <MicOn height={24} width={24} fill="#FFF" />
              ) : (
                <MicOff height={28} width={28} fill="#1D2939" />
              );
            }}
          />
          <IconContainer
            style={{
              borderWidth: 1.5,
              borderColor: '#2B3034',
            }}
            backgroundColor={!localWebcamOn ? '#fff' : 'transparent'}
            onPress={() => {
              toggleCamera();
            }}
            Icon={() => {
              return localWebcamOn ? (
                <VideoOn height={24} width={24} fill="#FFF" />
              ) : (
                <VideoOff height={36} width={36} fill="#1D2939" />
              );
            }}
          />
          <IconContainer
            style={{
              borderWidth: 1.5,
              borderColor: '#2B3034',
            }}
            backgroundColor={'transparent'}
            onPress={() => {
              switchCamera();
            }}
            Icon={() => {
              return <CameraSwitch height={24} width={24} fill="#FFF" />;
            }}
          />
        </View>
      </View>
    );
  };

  switch (type) {
    case 'JOIN':
      return JoinScreen();
    case 'INCOMING_CALL':
      return IncomingCallScreen();
    case 'OUTGOING_CALL':
      return OutgoingCallScreen();
    case 'WEBRTC_ROOM':
      return WebrtcRoomScreen();
    default:
      return null;
  }
}
