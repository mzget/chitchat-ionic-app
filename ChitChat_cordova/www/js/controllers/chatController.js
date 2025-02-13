/// <reference path="../../../typings/index.d.ts" />

angular.module('spartan.chat', [])

	.controller('chatController',
	function ($scope, $timeout, $stateParams, $rootScope, $state, $ionicScrollDelegate,
		$ionicTabsDelegate, $ionicPopup, $ionicPopover, $ionicLoading, $ionicModal, $mdDialog,
		$sce, $cordovaGeolocation, $cordovaDialogs, $cordovaInAppBrowser, chatRoomService, roomSelected,
		Favorite, blockNotifications, localNotifyService, sharedObjectService, chatsListHelperService, networkService) {
		// Hide nav-tab # in chat detail

		// $('#chatMessage').animate({ 'bottom': '0' }, 350);
		$ionicTabsDelegate.showBar(false);

		var self = this;
		self.title = 'chatController';

		var myprofile = main.getDataManager().myProfile;
		var allMembers = main.getDataManager().orgMembers;
		var hasOlderMessage = false;

		$scope.allMembers = allMembers;
		$scope.myprofile = myprofile;
		$scope.viewProfile = viewProfile;
		$scope.groupDetail = groupDetail;
		$scope.openPopover = openPopover;
		$scope.openModal = openChatMenusModal;
		$scope.closeChatMenu = closeChatMenu;
		$scope.openModalSticker = openModalSticker;
		$scope.openModalRecorder = openModalRecorder;
		$scope.openModalWebview = openModalWebview;
		$scope.closeModalWebview = closeModalWebview;
		$scope.closeReaderModal = closeReaderModal;
		$scope.webview = webview;
		$scope.image = image;
		$scope.video = video;
		$scope.voice = voice;
		$scope.viewReader = viewReader;
		$scope.openReaderModal = openReaderModal;
		$scope.parseJSON = parseJSON;
		$scope.viewLocation = viewLocation;
		$scope.openMap = openMap;
		$scope.openMapModal = openMapModal;
		$scope.closeMapModal = closeMapModal;
		$scope.isValidURI = isValidURI;
		$scope.editFavorite = editFavorite;
		$scope.editBlockNoti = editBlockNoti;
		$scope.isFavorite = isFavorite;
		$scope.isBlockNoti = isBlockNoti;
		$scope.loadOlderMessage = loadOlderMessage;
		$scope.sendMsg = sendMessage;
		$scope.sendSticker = sendSticker;
		$scope.isLoadingMessage = false;
		$scope.showLoadMessage = false;
		$scope.isOpenChatMenu = false;
		$scope.isOpenAudioRecordMenu = false;
		$scope.inactive = true;
		$scope.closeVoiceRecorder = closeVoiceRecorder;
		$scope.chat = [];

		function activate() {
			console.log(self.title + " is activate");

			setRoom();

			$scope.$on('onNewMessage', function (event, data) {
				console.debug('onNewMessage');
				$scope.$apply(function () { $scope.chat = chatRoomService.all(); }); //@ Call for changed scope.

				setTimeout(function () {
					if (ionic.Platform.platform() === 'ios' || ionic.Platform.platform() === 'android') {
						$ionicScrollDelegate.$getByHandle('mainScroll').scrollBottom(true);
					}
					else {
						$("#chatLayout").animate({ scrollTop: $("#chatLayout")[0].scrollHeight }, 200);
					}
				}, 100);
			});
			$scope.$on('onMessagesReady', function (event, data) {
				console.debug('onMessagesReady');

				$scope.$apply(function () {
					$scope.chat = chatRoomService.all();
				}); //@ Call for changed scope.

                if ($rootScope.isMobile) {
					setTimeout(function () {
						$ionicLoading.hide();
						$ionicScrollDelegate.$getByHandle('mainScroll').scrollBottom(true);
					}, 100);
                }
                else {
					$ionicLoading.hide();
                    setTimeout(function () {
						$("#chatLayout").animate({ scrollTop: $("#chatLayout")[0].scrollHeight }, 500);
					}, 200);
				}
			});
			$scope.$on('onJoinRoomReady', function (event, data) {
				console.debug('onJoinRoomReady');
				$scope.$apply(function () { $scope.chat = chatRoomService.all(); });

				setTimeout(function () {
                    $ionicLoading.hide();
                    if ($rootScope.isMobile) {
						$ionicScrollDelegate.$getByHandle('mainScroll').scrollBottom(true);
					}
                    else {
						$("#chatLayout").animate({ scrollTop: $("#chatLayout")[0].scrollHeight }, 500);
					}
				}, 100);

				chatRoomService.getChatRoomComponent().joinRoom(function cb(err, result) {
					if (result.code !== HttpStatusCode.success) {
						//<!-- Block user interface for this chat room.
						blockUI(true);
					} else {
						blockUI(false);

						if (chatRoomService.isPrivateChatRoom()) {
							chatRoomService.roomContactIsEmpty(function (boo) {
								blockUI(boo);
							});
						}

						chatRoomService.updateReadMessages();
						chatRoomService.updateWhoReadMyMessages();
					}
				});
			});
			$scope.$on('onOlderMessageReady', function ready(event, data) {
				console.debug('onOlderMessageReady', data)

				hasOlderMessage = data;
				$scope.showLoadMessage = hasOlderMessage;
			});
			$scope.$on('onMessageChanged', function (event, data) {
				console.debug('onMessageChanged', chatRoomService.all().length);

				$scope.chat = chatRoomService.all();
				$scope.isLoadingMessage = false;
			});
			$scope.$on('ondeactivateBgMode', function (event, data) {
				console.log('Need to update message read here.');

				chatRoomService.updateReadMessages();
			});
			$scope.$on('onShareLocation', function (event, data) {
				sendLocation(data);
			});
		}
		function setScopeData() {
			myprofile = main.getDataManager().myProfile;
			allMembers = main.getDataManager().orgMembers;
			$scope.allMembers = allMembers;
			$scope.myprofile = myprofile;
		}
		function setRoom() {
            blockUI(true);
			self.currentRoom = roomSelected.getRoomOrLastRoom();
			console.info("setup room: $currentRoom is ", self.currentRoom);

			if (!$rootScope.isMobile) {
				if (self.currentRoom == null || self.currentRoom === undefined) {
					var group = main.getDataManager().getGroup($rootScope.teamInfo.root);
					roomSelected.setRoom(group);
					self.currentRoom = roomSelected.getRoomOrLastRoom();
				}
			}

			$scope.currentRoom = self.currentRoom;

			//<!-- Set up roomname for display title of chatroom.
			let roomName = (self.currentRoom) ? self.currentRoom.name : "";
			if (!roomName || roomName === "") {
				if ( !!self.currentRoom && self.currentRoom.type === RoomType.privateChat) {
					self.currentRoom.members.some(function iterator(member) {
						if (member.id !== myprofile._id) {
							self.currentRoom.name = allMembers[member.id].displayname;
							return true;
						}
					});
				}
			}

			if (!!self.currentRoom && $scope.currentRoom.type == RoomType.privateChat) {
				$.each($scope.currentRoom.members, function (index, value) {
					if (value.id != main.getDataManager().myProfile._id) {
						$scope.otherId = value.id;
					}
				});
			}

			//@ Sent room name to headerController.
			if (!$rootScope.isMobile && $scope.currentRoom) {
				$rootScope.$broadcast('roomName', $scope.currentRoom.name);
			}

			setTimeout(function () {
				chatRoomService.init();
				chatRoomService.getPersistendMessage();
			}, 100);
		}
		function blockUI(boo) {
			console.log("block ui", boo);
			$scope.inactive = boo;
		}
		function setupMenuItem() {
			if ($scope.currentRoom && self.currentRoom.type != RoomType.privateChat) {
				$ionicPopover.fromTemplateUrl('templates/popover-group.html', {
					scope: $scope,
				}).then(function (popover) {
					$scope.popover = popover;
				});
			} else {
				$ionicPopover.fromTemplateUrl('templates/popover-contact.html', {
					scope: $scope,
				}).then(function (popover) {
					$scope.popover = popover;
				});
			}
		}
		function viewProfile() {
			$scope.popover.hide();
			if ($state.current.name === NGStateUtil.tab_chats_chat) {
				$state.go(NGStateUtil.tab_chats_chat_viewprofile, { chatId: $scope.otherId });
			} else {
				$state.go('tab.group-viewprofile', { chatId: $scope.otherId });
			}
		}
		function groupDetail(state) {
			$scope.popover.hide();
			$rootScope.selectTab = state;
			if ($state.current.name === NGStateUtil.tab_chats_chat) {
				$state.go(NGStateUtil.tab_chats_chat_members, { chatId: self.currentRoom._id });
			} else {
				$state.go('tab.group-members', { chatId: self.currentRoom._id });
			}
		}
		function openPopover($event) {
			$scope.popover.show($event);
		}
		function viewReader(readers) {
			var members = [];
			async.each(readers, function iterator(item, cb) {
				var member = dataManager.orgMembers[item];
				if (!!member) {
					members.push(member);
				}
				cb();
			}, function done(err) {
				$scope.readers = members;
				openReaderModal();
			});
		}
		function parseJSON(json) {
			return JSON.parse(json);
		}
		function viewLocation(messageId) {
			var message = chatRoomService.get(messageId);

			console.info('viewLocation');

			if (ionic.Platform.platform() == "ios" || ionic.Platform.platform() == "android") {
				viewMap($scope, JSON.parse(message.body));
				$scope.mapViewModal.show();
			}
			else {
				$mdDialog.show({
					templateUrl: 'templates_web/map.html',
					parent: angular.element(document.body),
					//targetEvent: ev,
					clickOutsideToClose: true
				});
				setTimeout(function () {
					web_viewMap($scope, $rootScope, JSON.parse(message.body));
				}, 500);
			}
		}
		function openMap() {
			console.log('openMap');

			if (ionic.Platform.platform() != 'ios' && ionic.Platform.platform() != 'android') {
				$scope.isOpenChatMenu = false;

				$mdDialog.show({
					templateUrl: 'templates_web/map.html',
					parent: angular.element(document.body),
					//targetEvent: ev,
					clickOutsideToClose: true
				});

				openMapModal();
			}
			else {
				$scope.chatMenuModal.hide();
				$scope.mapViewModal.show();
				$scope.openMapModal();
			}
		}
		function openMapModal() {
			if (ionic.Platform.platform() != 'ios' && ionic.Platform.platform() != 'android') {
				web_callGeolocation($scope, $rootScope, $cordovaGeolocation, $ionicLoading, $cordovaDialogs);
			}
			else {
				callGeolocation($scope, $cordovaGeolocation, $ionicLoading, $cordovaDialogs, function (locationObj) {
					sendLocation(locationObj);
				});
			}
		};
		function closeMapModal() {
			$scope.mapViewModal.hide();
		};
		function isValidURI(uri) {
			if (uri.substr(0, 3) == 'www' || uri.substr(0, 4) == 'http' || uri.substr(0, 3) == 'ftp')
				if (uri.split(".").length > 2 && uri.split(".")[1] != '' && uri.split(".")[2] != '')
					return true;

			return false;
		};
		function editFavorite(editType, id, type) {
			$ionicLoading.show({
				template: 'Loading..'
			});
			if (type == RoomType.privateChat) {
				server.updateFavoriteMember(editType, id, function (err, res) {
					if (!err && res.code == 200) {
						console.log(JSON.stringify(res));
						Favorite.updateFavorite(editType, id, type);
						$ionicLoading.hide();
					}
					else {
						console.warn(err, res);
						$ionicLoading.hide();
					}
				});
			} else {
				server.updateFavoriteGroups(editType, id, function (err, res) {
					if (!err && res.code == 200) {
						console.log(JSON.stringify(res));
						Favorite.updateFavorite(editType, id, type);
						$ionicLoading.hide();
					}
					else {
						console.warn(err, res);
						$ionicLoading.hide();
					}
				});
			}
		}
		function editBlockNoti(editType, id, type) {
			$ionicLoading.show({
				template: 'Loading..'
			});
			if (type == RoomType.privateChat) {
				server.updateClosedNoticeMemberList(editType, id, function (err, res) {
					if (!err && res.code == 200) {
						console.log(JSON.stringify(res));
						blockNotifications.updateBlockNoti(editType, id, type);
						$ionicLoading.hide();
					}
					else {
						console.warn(err, res);
						$ionicLoading.hide();
					}
				});
			} else {
				server.updateClosedNoticeGroupsList(editType, id, function (err, res) {
					if (!err && res.code == 200) {
						console.log(JSON.stringify(res));
						blockNotifications.updateBlockNoti(editType, id, type);
						$ionicLoading.hide();
					}
					else {
						console.warn(err, res);
						$ionicLoading.hide();
					}
				});
			}
		}
		function isFavorite(id) {
			return Favorite.isFavorite(id);
		}
		function isBlockNoti(id) {
			return blockNotifications.isBlockNoti(id);
		}
		function loadOlderMessage() {
			chatRoomService.getOlderMessageChunk();
			$scope.isLoadingMessage = true;
			$scope.showLoadMessage = false;
		}

		modalcount = 0;
		function setupModals() {
			if ($rootScope.isMobile) {
				// Reload Modal - Chat menu
				$ionicModal.fromTemplateUrl('templates/modal-chatmenu.html', {
					scope: $scope,
					animation: 'slide-in-up'
				}).then(function (modal) {
					$scope.chatMenuModal = modal;
				}).catch(function (err) {
					console.error(err);
				});

				// Map modal view modal.
				$ionicModal.fromTemplateUrl('templates/map.html', {
					scope: $scope,
					animation: 'slide-in-up'
				}).then(function (modal) {
					$scope.mapViewModal = modal;
				});

				// Reader view modal.
				$ionicModal.fromTemplateUrl('templates/modal-reader-view.html', {
					scope: $scope,
					animation: 'slide-in-up'
				}).then(function (modal) {
					$scope.readerViewModal = modal;
				});

				// Reload Modal - Sticker
				$ionicModal.fromTemplateUrl('templates/modal-sticker.html', {
					scope: $scope,
					animation: 'slide-in-up'
				}).then(function (modal) {
					$scope.modalSticker = modal;
				});

				// Audio recorder modal.
				$ionicModal.fromTemplateUrl('templates/modal-audio-recorder.html', {
					scope: $scope,
					animation: 'slide-in-up'
				}).then(function (modal) {
					$scope.modalAudio = modal;
				})
			}

			// Reload Modal - WebView
			$ionicModal.fromTemplateUrl('templates/modal-webview.html', {
				scope: $scope,
				animation: 'slide-in-up'
			}).then(function (modal) {
				$scope.modalWebview = modal;
			})

			//Cleanup the modal when we're done with it!
			$scope.$on('$destroy', function () {
				if (!!$scope.chatMenuModal) {
					$scope.chatMenuModal.remove();
				}
				$scope.modalSticker.remove();
				$scope.modalAudio.remove();
				$scope.modalWebview.remove();
				$scope.readerViewModal.remove();
				if (!!$scope.mapViewModal) {
					$scope.mapViewModal.remove();
				}
			});
			// Execute action on hide modal
			$scope.$on('modal.hidden', function () {
				// Execute action

				if (modalcount > 0) {
					modalcount--;
				}

				if (modalcount == 1) {
					if ($rootScope.currentPlatform == "ios" || $rootScope.currentPlatform == "android") {
						$scope.chatMenuModal.hide();
					}
					else {
						$scope.isOpenChatMenu = false;
					}
				}

				$('#chatMessage').animate({ 'bottom': '0' }, 350);
				$('#chatDetail').animate({ 'top': '0' }, 350);

				if ($('.audio-recorder').is(".recording")) {
					$('.audio-recorder').removeClass("recording");
					$('.audio-recorder').addClass("unrecording");
					$scope.$broadcast('cancelRecord', 'cancelRecord');
				}
			});
			// Execute action on remove modal
			$scope.$on('modal.removed', function () {
				// Execute action
			});
		}
		// Modal - Chat menu 
		function openChatMenusModal() {
			modalcount++;
			if (ionic.Platform.platform == "ios" || ionic.Platform.platform == "android") {
				$scope.chatMenuModal.show();
				$('#chatMessage').animate({ 'bottom': '272px' }, 350);
				$('#chatDetail').animate({ 'top': '-272px' }, 350);
			}
			//document.getElementById('chatMenuContain').style.left = jQuery('#leftLayout').offset().left + jQuery('#leftLayout').width() + "px";
			//document.getElementById('chatMenuContain').style.width = jQuery('#webchatdetail').width() + "px";

			else {
				$scope.isOpenChatMenu = true;
			}
		};
		function closeChatMenu() {
			$scope.isOpenChatMenu = false;
		}

		// Modal - Sticker
		function openModalSticker() {
			modalcount++;
			if ($rootScope.isMobile) {
				$scope.modalSticker.show();
			}
			else {
				$scope.isOpenChatMenu = false;
				//document.getElementById('stickerContain').style.left = jQuery('#leftLayout').offset().left + jQuery('#leftLayout').width() + "px";
				//document.getElementById('stickerContain').style.width = jQuery('#webchatdetail').width() + "px";
				$mdDialog.show({
					templateUrl: 'templates_web/modal-sticker.html',
					controller: function ($scope) {
						$scope.sendSticker = sendSticker
					},
					parent: angular.element(document.body),
					clickOutsideToClose: true
				});
			}
		};
		function sendSticker(sticker) {
			$ionicLoading.show({
				template: 'Sending...'
			});

			chatRoomService.sendMessage(self.currentRoom._id, "*", myprofile._id, sticker, ContentType[ContentType.Sticker], sendMessageResponse);

			if ($rootScope.isMobile) {
				$scope.modalSticker.hide();
				$scope.chatMenuModal.hide();
			}
		}
		// Modal - Audio Recorder
		function openModalRecorder() {
			modalcount++;
			if ($rootScope.isMobile) {
				$scope.modalAudio.show();
			}
			else {
				$scope.isOpenChatMenu = false;
				$scope.isOpenAudioRecordMenu = true;

				/* Old code from ionic v.1.1+
				if(ionic.Platform.platform() != 'ios' && ionic.Platform.platform() != 'android') {
					document.getElementById('recorderContain').style.left = jQuery('#leftLayout').offset().left + jQuery('#leftLayout').width() + "px";
					document.getElementById('recorderContain').style.width = jQuery('#webchatdetail').width() + "px";
				}
				*/
			}
		}
		function closeVoiceRecorder() {
			$scope.isOpenAudioRecordMenu = false;

			if ($('.audio-recorder').is(".recording")) {
				$('.audio-recorder').removeClass("recording");
				$('.audio-recorder').addClass("unrecording");
				$scope.$broadcast('cancelRecord', 'cancelRecord');
			}
		}
		// Modal - Webview 
		function openModalWebview() {
			modalcount++;
			$scope.modalWebview.show();
		};
		function closeModalWebview() {
			$scope.modalWebview.hide();
		};
		function openReaderModal() {
			if ($rootScope.isMobile) {
				$scope.readerViewModal.show();
			}
			else {
				$rootScope.readers = $scope.readers;
				$mdDialog.show({
					templateUrl: 'templates_web/modal-reader-view.html',
					parent: angular.element(document.body),
					//targetEvent: ev,
					clickOutsideToClose: true
				});
			}
		};
		function closeReaderModal() {
			$scope.readerViewModal.hide();
		};
		function hideAllModal() {
			$scope.chatMenuModal.hide();
			$scope.modalSticker.hide();
			$scope.modalAudio.hide();
			$scope.modalWebview.hide();
			$scope.readerViewModal.hide();
			$scope.mapViewModal.hide();
		}

		// WebView
		function webview(uri) {
			if (ionic.Platform.platform() == 'ios' || ionic.Platform.platform() == 'android') {
				http = '';
				if (uri.substr(0, 3) == 'www' || uri.substr(0, 3) == 'ftp')
					http = 'http://';
				http += uri;

				var options = {
					location: 'no',
					clearcache: 'yes',
					toolbar: "yes",
					toolbarposition: "top"
					// presentationstyle: 'pagesheet'
				};

				$cordovaInAppBrowser.open(http, '_system', options)
					.then(function (event) {
						// success     
						console.log('success open cordovaInAppBrowser')
					})
					.catch(function (event) {
						// error
						console.log('fail open cordovaInAppBrowser')
					});

				$rootScope.$on('$cordovaInAppBrowser:loadstart', function (e, event) {
					console.log('loadstart');
				});

				$rootScope.$on('$cordovaInAppBrowser:loadstop', function (e, event) {
					console.log('loadstop');
				});

				$rootScope.$on('$cordovaInAppBrowser:loaderror', function (e, event) {

				});

				$rootScope.$on('$cordovaInAppBrowser:exit', function (e, event) {

				});
			}
			else {
				http = '';
				if (uri.substr(0, 3) == 'www' || uri.substr(0, 3) == 'ftp')
					http = 'http://';
				http += uri;

				window.open(http);
			}
		};
		function sendLocation(locationObj) {
			$ionicLoading.show({
				template: 'Sending...'
			});

			chatRoomService.sendMessage(self.currentRoom._id, "*", myprofile._id, JSON.stringify(locationObj), ContentType[ContentType.Location], sendMessageResponse);
		}
		function image() {
			if ($rootScope.currentPlatform == "ios" || $rootScope.currentPlatform == "android") {
				//@ Emit to mediaController. 
				$scope.$broadcast('addImg', 'addImg');

				$scope.chatMenuModal.hide();
			}
			else {
				$('#fileToUpload').trigger('click');
				$scope.isOpenChatMenu = false;
			}
		}
		function video() {
			if ($rootScope.currentPlatform == "ios" || $rootScope.currentPlatform == "android") {
				//@ Emit to mediaController. 
				$scope.$broadcast('captureVideo', 'captureVideo');

				$scope.chatMenuModal.hide();
			} else {
				$('#fileToUpload').trigger('click');
				$scope.isOpenChatMenu = false;
			}
		}
		function voice() {
			if ($('.audio-recorder').is(".recording")) {
				$('.audio-recorder').removeClass("recording");
				$('.audio-recorder').addClass("unrecording");
				if ($rootScope.isMobile) {
					$scope.$broadcast('stopRecord', 'stopRecord');
				}
				else {
					$rootScope.$broadcast('stopRecord', 'stopRecord');
					closeVoiceRecorder();
				}
			}
			else {
				$('.audio-recorder').removeClass("unrecording");
				$('.audio-recorder').addClass("recording");
				if ($rootScope.isMobile)
					$scope.$broadcast('startRecord', 'startRecord');
				else
					$rootScope.$broadcast('startRecord', 'startRecord');
			}
		}

		// $("#modal-webview-iframe").on('load', function () {
		// 	alert($(this).contentDocument.title);
		// });
		//@ It not support in electron client.
		if (document.getElementById("modal-webview-iframe")) {
			document.getElementById("modal-webview-iframe").onload(function (event) {
				alert($(this).contentDocument.title);
			});
		}

		if (document.getElementById("send_message")) {
			document.getElementById("send_message").onkeyup = function (event) {
				//@ detect return button.
				if (event.keyCode == 13) {
					sendMessage();
				}
			};
		}

		// Send Message btn
		function sendMessage() {
			var value = $('#send_message').val();
			var content = value.trim();
			if (content != "" && content != '' && content != '\n') {
				// Clear Message
				$('#send_message').val('')

				if (server.appConfig.encryption == true) {
					main.encodeService(content, function (err, result) {
						if (err) {
							console.error(err);
						}
						else {
							$ionicLoading.show({
								template: 'Sending...'
							}).then(function () {
								console.log("The loading indicator is now displayed");
							});
							chatRoomService.sendMessage(self.currentRoom._id, "*", myprofile._id, result, ContentType[ContentType.Text], sendMessageResponse);
						}
					});
				}
				else {
					$ionicLoading.show({
						template: 'Sending...'
					}).then(function () {
						console.log("The loading indicator is now displayed");
					});
					chatRoomService.sendMessage(self.currentRoom._id, "*", myprofile._id, content, ContentType[ContentType.Text], sendMessageResponse);
				}
			}
			else {
				// Clear Message
				$('#send_message').val('')
			}
		}

		function sendMessageResponse(err, res) {
			$ionicLoading.hide();
			console.log("sendMessageResponse:", JSON.stringify(res));

			if (!!err || res.code !== HttpStatusCode.success) {
				console.error("send message fail.", err, res);
			}
		}

		//@ Broadcast from mediaController.
		$scope.$on('sendFile', function (event, args) {
			$ionicLoading.show({
				template: 'Sending...'
			}).then(function () {
				console.log("The loading indicator is now displayed");
			});

			var mediaName = args.mediaName;
			var url = args.url;
			var type = args.type;
			chatRoomService.sendMessage(self.currentRoom._id, "*", myprofile._id, url, type, function (err, res) {
				hideAllModal();
				$ionicLoading.hide().then(function () {
					console.log("The loading indicator is now hidden");
				});

				if (err || res === null) {
					console.warn("send message fail.");
				}
				else {
					console.log("send File Success:", JSON.stringify(res));

					$rootScope.$broadcast('onSendFileSuccess', { messageId: res.messageId });
					deleteTemp([mediaName]);
				}
			});
		});
		function deleteTemp(args) {
			$.each($scope.chat, function (index, value) {
				if (value._id == args[0]) {
					$scope.chat[index] = new Object;
				}
			});
		}

		$scope.$on('menuChat.hidden', function () {
			modalcount--;
			if ($rootScope.isMobile) {
				$scope.chatMenuModal.hide();
				$scope.modalAudio.hide();
			}
			else {
				$scope.isOpenChatMenu = false;
			}

			$('#chatMessage').animate({ 'bottom': '0' }, 350);
			$('#chatDetail').animate({ 'top': '0' }, 350);

			if ($('.audio-recorder').is(".recording")) {
				$('.audio-recorder').removeClass("recording");
				$('.audio-recorder').addClass("unrecording");
				$scope.$broadcast('cancelRecord', 'cancelRecord');
			}
		});
		// Recivce ImageUri from Gallery then send to other people
		$scope.$on('fileUri', function (event, args) {
			if (ionic.Platform.platform() === "ios") {
				if (args[1] == ContentType[ContentType.Image]) {
					$scope.chat.push({ "rid": self.currentRoom._id, "type": ContentType[ContentType.Image], "body": cordova.file.documentsDirectory + args[0], "sender": myprofile._id, "_id": args[0][0], "createTime": new Date(), "temp": "true" });
				} else if (args[1] == ContentType[ContentType.Voice]) {
					$scope.chat.push({ "rid": self.currentRoom._id, "type": ContentType[ContentType.Voice], "body": cordova.file.documentsDirectory + args[0], "sender": myprofile._id, "_id": args[0], "createTime": new Date(), "temp": "true" });
				} else if (args[1] == ContentType[ContentType.Video]) {
					$scope.chat.push({ "rid": self.currentRoom._id, "type": ContentType[ContentType.Video], "body": cordova.file.documentsDirectory + args[0], "sender": myprofile._id, "_id": args[0], "createTime": new Date(), "temp": "true" });
				}
			} else {
				if (args[1] == ContentType[ContentType.Image]) {
					$scope.chat.push({ "rid": self.currentRoom._id, "type": ContentType[ContentType.Image], "body": args[0], "sender": myprofile._id, "_id": args[0], "createTime": new Date(), "temp": "true" });
				} else if (args[1] == ContentType[ContentType.Video]) {
					var file = document.querySelector("[id='fileToUpload']").files[0];
					var fileUrl = $sce.trustAsResourceUrl(URL.createObjectURL(file));
					$scope.chat.push({ "rid": self.currentRoom._id, "type": ContentType[ContentType.Video], "body": fileUrl, "sender": myprofile._id, "_id": args[0], "createTime": new Date(), "temp": "true" });
				} else if (args[1] == ContentType[ContentType.File]) {
					var file = document.querySelector("[id='fileToUpload']").files[0];
					$scope.chat.push({ "rid": self.currentRoom._id, "type": ContentType[ContentType.File], "body": file.name, "sender": myprofile._id, "_id": args[0], "createTime": new Date(), "temp": "true" });
				}
				else if (args[1] == ContentType[ContentType.Voice]) {
					$scope.chat.push({ "rid": self.currentRoom._id, "type": ContentType[ContentType.Voice], "body": args[0], "sender": myprofile._id, "_id": args[0], "createTime": new Date(), "temp": "true" });
				}
			}
		});
		// Send Image and remove temp Image
		$scope.$on('fileUrl', function (event, args) {
			if (args[2] == ContentType[ContentType.Image]) {
				$ionicLoading.show({
					template: 'Sending...'
				}).then(function () {
					console.log("The loading indicator is now displayed");
				});
				chatRoomService.sendMessage(self.currentRoom._id, "*", myprofile._id, args[0], ContentType[ContentType.Image], sendMessageResponse);
			} else if (args[2] == ContentType[ContentType.Voice]) {
				$ionicLoading.show({
					template: 'Sending...'
				}).then(function () {
					console.log("The loading indicator is now displayed");
				});
				chatRoomService.sendMessage(self.currentRoom._id, "*", myprofile._id, args[0], ContentType[ContentType.Voice], sendMessageResponse);
			} else if (args[2] == ContentType[ContentType.Video]) {
				$ionicLoading.show({
					template: 'Sending...'
				}).then(function () {
					console.log("The loading indicator is now displayed");
				});
				chatRoomService.sendMessage(self.currentRoom._id, "*", myprofile._id, args[0], ContentType[ContentType.Video], sendMessageResponse);
			}

			if (!$rootScope.isMobile) {
				if (args[2] == ContentType[ContentType.File]) {
					// $ionicLoading.show({
					// 	template: 'Sending...'
					// }).then(function () {
					// 	console.log("The loading indicator is now displayed");
					// });
					chatRoomService.sendFile(self.currentRoom._id, "*", myprofile._id, args[0], ContentType[ContentType.File], 'bobobobo');
				}
			}
			$.each($scope.chat, function (index, value) {
				if (value._id == args[1]) {
					$scope.chat[index] = new Object;
				}
			});
		});
		$scope.$on('delectTemp', function (event, args) {
			deleteTemp(args);
		});

		$scope.$on('enterChat', function (event, args) {
			console.log("App view (menu) entered.");

			$ionicLoading.show({
				template: 'Loading...'
			});
			activate();
			setupMenuItem();
			setupModals();
			setScopeData();
		});

		$scope.$on('changeChat', function (event, args) {
			console.info('changed chat room.', args);

			if(!args) {
				alert("Cannot load chatroom.");
				return;
			}

			let newRoom = JSON.parse(JSON.stringify(args));
			if (newRoom._id == roomSelected.getRoomOrLastRoom()._id) { return; }

			//@ Highlight a new room selected.
			chatsListHelperService.highlightGroup(newRoom._id);
			chatsListHelperService.highlightChatslog(newRoom._id);

			$scope.chat = null;
			$ionicLoading.show({
				template: 'Loading...'
			});

			chatRoomService.leaveRoomCB(function () {
				$scope.chat = {};
				roomSelected.setRoom(newRoom);
				setRoom();
			});

			$('#webchatdetail').find('.message-list').empty();
		});

		$scope.$on('$ionicView.enter', function () {
			console.debug('$ionicView.enter', self.title);

			$ionicLoading.show({
				template: 'Loading...'
			});

			activate();
			setupMenuItem();
			setupModals();
		});

		$scope.$on('$ionicView.beforeLeave', function () { //This just one when leaving, which happens when I logout
			console.debug('$ionicView.beforeLeave', self.title);

			chatRoomService.leaveRoom();
		});

		$scope.$on('$ionicView.leave', function () {
			console.debug("$ionicView.leave:", self.title);
		});

		$scope.$on('$ionicView.loaded', function () {
			console.debug("$ionicView.loaded: ", self.title);
		});
		$scope.$on('$ionicView.unloaded', function () {
			console.debug("$ionicView.unloaded:", self.title);
		});
	});

var viewMap = function ($scope, message, $ionicLoading) {
	$scope.viewOnly = true;
	$scope.place = message.name;
	$scope.$broadcast('onInitMap', { lat: message.latitude, long: message.longitude });
}
var web_viewMap = function ($scope, $rootScope, message) {
    $scope.viewOnly = true;
    $scope.place = message.name;

    console.warn(message);
    $rootScope.$broadcast('onInitMap', { lat: message.latitude, long: message.longitude });
    var packData = {
        lat: message.latitude,
        lng: message.longitude,
        viewType: $scope.viewOnly,
        place: $scope.place
    }
    $rootScope.$broadcast('getPosReady', packData);
}
var callGeolocation = function ($scope, $cordovaGeolocation, $ionicLoading, $cordovaDialogs, done) {
    var locationObj = new MinLocation();
    $scope.viewOnly = false;
    $scope.place = "";
    $scope.selectedPlace = function (place) {
        console.debug('onSelectMarker', place)
        $scope.place = place.name;
        $scope.myLocation = place;
    };

    $scope.share = function () {
        if (!$scope.place) {
            $cordovaDialogs.alert('Missing place information', 'Share location', 'OK')
				.then(function () {
					// callback success
				});

            return;
        }

        locationObj.name = $scope.myLocation.name;
        locationObj.address = $scope.myLocation.vicinity;
        done(locationObj);
        $scope.closeMapModal();
    }

    $ionicLoading.show({
        template: 'Getting current location...'
    });

    var posOptions = { timeout: 10000, enableHighAccuracy: false };
    $cordovaGeolocation.getCurrentPosition(posOptions).then(function (position) {
        locationObj.latitude = position.coords.latitude;
        locationObj.longitude = position.coords.longitude;

        $scope.$broadcast('onInitMap', { lat: position.coords.latitude, long: position.coords.longitude });

        $ionicLoading.hide();
    }, function (err) {
        // error
        console.warn(err);

        $ionicLoading.hide();

        $cordovaDialogs.alert(err.message, 'Location Fail.', 'OK')
			.then(function () {
				$scope.closeMapModal();
				$ionicLoading.hide();
			});
    });
}
var web_callGeolocation = function ($scope, $rootScope, $cordovaGeolocation, $ionicLoading, $cordovaDialogs) {
	$scope.viewOnly = false;
	$scope.place = "";

	$ionicLoading.show({
		template: 'Getting current location...'
	});

	var posOptions = { timeout: 10000, enableHighAccuracy: false };
	$cordovaGeolocation.getCurrentPosition(posOptions).then(function (position) {
		$ionicLoading.hide();
		console.info(position);

		$rootScope.$broadcast('onInitMap', { lat: position.coords.latitude, long: position.coords.longitude });

        var packData = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            viewType: $scope.viewOnly,
            place: $scope.place
        }
        $rootScope.$broadcast('getPosReady', packData);
	}, function (err) {
		// error
		console.warn(err);

		$ionicLoading.hide();

		$cordovaDialogs.alert(err.message, 'Location Fail.', 'OK')
			.then(function () {
				$scope.closeMapModal();
				$ionicLoading.hide();
			});
	});
}