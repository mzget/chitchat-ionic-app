interface IRoomMap {
    [key: string]: Room;
}
interface IMemberMep {
    [key: string]: ContactInfo;
}

class DataManager implements absSpartan.IFrontendServerListener {
    /*
        private static _instance: DataManager;
        public static getInstance(): DataManager {
            if (this._instance === null || this._instance === undefined) {
                this._instance = new DataManager();
            }
    
            return this._instance;
        }
    */
    public myProfile: User;
    public orgGroups: IRoomMap = {};
    public projectBaseGroups: IRoomMap = {};
    public privateGroups: IRoomMap = {};
    public privateChats: IRoomMap = {};
    public orgMembers: IMemberMep = {};
    public isOrgMembersReady: boolean = false;
    public companyInfo: CompanyInfo;

    public onCompanyInfoReady: () => void;
    public onMyProfileReady: (dataManager: DataManager) => void;
    public onOrgGroupDataReady: () => void;
    public onProjectBaseGroupsDataReady: () => void;
    public onPrivateGroupsDataReady: () => void;
    public onContactsDataReady: () => void;

    //@ Profile...
    public setMyProfile(data: any) {
        this.myProfile = JSON.parse(JSON.stringify(data));

        if (!!this.onMyProfileReady)
            this.onMyProfileReady(this);
    }
    public getMyProfile(): User {
        return this.myProfile;
    }
    public isMySelf(uid: string): boolean {
        if (uid === this.myProfile._id) {
            return true;
        }
        else {
            return false;
        }
    }

    /**
     * RoomAccess...
     */
    public getRoomAccess(): RoomAccessData[] {
        return this.myProfile.roomAccess;
    }
    public setRoomAccessForUser(data) {
        if (!!data.roomAccess) {
            this.myProfile.roomAccess = JSON.parse(JSON.stringify(data.roomAccess));

            console.info('set user roomAccess info.');
        }
    }
    public updateRoomAccessForUser(data) {
        let arr: Array<RoomAccessData> = JSON.parse(JSON.stringify(data.roomAccess));
        this.myProfile.roomAccess.forEach(value => {
            if (value.roomId === arr[0].roomId) {
                value.accessTime = arr[0].accessTime;

                return;
            }
        });
    }

    public getCompanyInfo() {
        return this.companyInfo;
    }
    public setCompanyInfo(data: any) {
        this.companyInfo = JSON.parse(JSON.stringify(data));

        if (!!this.onCompanyInfoReady) {
            this.onCompanyInfoReady();
        }
    }

    //<!---------- Group ------------------------------------

    public getGroup(id: string): Room {
        if (!!this.orgGroups[id]) {
            return this.orgGroups[id];
        }
        else if (!!this.projectBaseGroups[id]) {
            return this.projectBaseGroups[id];
        }
        else if (!!this.privateGroups[id]) {
            return this.privateGroups[id];
        }
        else if (!!this.privateChats && !!this.privateChats[id]) {
            return this.privateChats[id];
        }
    }
    public addGroup(data: Room) {
        switch (data.type) {
            case RoomType.organizationGroup:
                if (!this.orgGroups[data._id]) {
                    this.orgGroups[data._id] = data;
                }
                break;
            case RoomType.projectBaseGroup:
                if (!this.projectBaseGroups[data._id]) {
                    this.projectBaseGroups[data._id] = data;
                }
                break;
            case RoomType.privateGroup:
                if (!this.privateGroups[data._id]) {
                    this.privateGroups[data._id] = data;
                }
                break;
            case RoomType.privateChat:
                if (!this.privateChats) {
                    this.privateChats = {};
                }
                if (!this.privateChats[data._id]) {
                    this.privateChats[data._id] = data;
                }
                break;
            default:
                console.info("new room is not a group type.");
                break;
        }
    }

    public updateGroupImage(data: Room) {
        if (!!this.orgGroups[data._id]) {
            this.orgGroups[data._id].image = data.image;
        }
        else if (!!this.projectBaseGroups[data._id]) {
            this.projectBaseGroups[data._id].image = data.image;
        }
        else if (!!this.privateGroups[data._id]) {
            this.privateGroups[data._id].image = data.image;
        }
    }
    public updateGroupName(data: Room) {
        if (!!this.orgGroups[data._id]) {
            this.orgGroups[data._id].name = data.name;
        }
        else if (!!this.projectBaseGroups[data._id]) {
            this.projectBaseGroups[data._id].name = data.name;
        }
        else if (!!this.privateGroups[data._id]) {
            this.privateGroups[data._id].name = data.name;
        }
    }
    public updateGroupMembers(data: Room) {
        //<!-- Beware please checking myself before update group members.
        //<!-- May be your id is removed from group.
        var hasMe = this.checkMySelfInNewMembersReceived(data);

        if (data.type === RoomType.organizationGroup) {
            if (!!this.orgGroups[data._id]) {
                //<!-- This statement call when current you still a member.
                if (hasMe) {
                    this.orgGroups[data._id].members = data.members;
                }
                else {
                    console.warn("this org group is not contain me in members list.");
                }
            }
            else {
                this.orgGroups[data._id] = data;
            }
        }
        else if (data.type === RoomType.projectBaseGroup) {
            if (!!this.projectBaseGroups[data._id]) {
                if (hasMe) {
                    this.projectBaseGroups[data._id].visibility = true;
                    this.projectBaseGroups[data._id].members = data.members;
                }
                else {
                    this.projectBaseGroups[data._id].visibility = false;
                }
            }
            else {
                this.projectBaseGroups[data._id] = data;
            }
        }
        else if (data.type === RoomType.privateGroup) {
            if (!!this.privateGroups[data._id]) {
                if (hasMe) {
                    this.privateGroups[data._id].visibility = true;
                    this.privateGroups[data._id].members = data.members;
                }
                else {
                    this.privateGroups[data._id].visibility = false;
                }
            }
            else {
                console.debug("new group", data.name);
                this.privateGroups[data._id] = data;
            }
        }

        console.log('dataManager.updateGroupMembers:');
    }
    public updateGroupMemberDetail(jsonObj: any) {
        var editMember = jsonObj.editMember;
        var roomId = jsonObj.roomId;

        var groupMember: Member = new Member();
        groupMember.id = editMember.id;
        var role = <string>editMember.role;
        groupMember.role = MemberRole[role];
        groupMember.jobPosition = editMember.jobPosition;

        this.getGroup(roomId).members.forEach((value, index, arr) => {
            if (value.id === groupMember.id) {
                this.getGroup(roomId).members[index].role = groupMember.role;
                this.getGroup(roomId).members[index].textRole = MemberRole[groupMember.role]
                this.getGroup(roomId).members[index].jobPosition = groupMember.jobPosition;
            }
        });
    }

    private checkMySelfInNewMembersReceived(data: Room): boolean {
        var self = this;
        var hasMe = data.members.some(function isMySelfId(element, index, array) {
            return element.id === self.myProfile._id;
        });

        console.debug("New data has me", hasMe);
        return hasMe;
    }

    //<!------------------------------------------------------

    public onUserLogin(dataEvent) {
        let jsonObject = JSON.parse(JSON.stringify(dataEvent));
        let _id: string = jsonObject._id;
        let self = this;

        if (!this.orgMembers) this.orgMembers = {};
        if (!this.orgMembers[_id]) {
            //@ Need to get new contact info.
            ChatServer.ServerImplemented.getInstance().getMemberProfile(_id, (err, res) => {
                if (!err) {
                    console.log("getMemberProfile : result", JSON.stringify(res));

                    let datas: Array<any> = JSON.parse(JSON.stringify(res.data));
                    let contact: ContactInfo = new ContactInfo();
                    contact._id = datas[0]._id;
                    contact.displayname = datas[0].displayname;
                    contact.image = datas[0].image;
                    contact.status = datas[0].status;

                    self.orgMembers[contact._id] = contact;

                    console.log(contact);

                    if (self.onContactsDataReady != null) {
                        self.onContactsDataReady();
                    }

                    console.log("We need to save contacts list to persistence data layer.");
                }
                else {
                    console.error("getMemberProfile fail.", err);
                }
            });
        }
        else {
            console.log("Online:", this.orgMembers[_id]);
        }
    }

    public updateContactImage(contactId: string, url: string) {
        if (!!this.orgMembers[contactId]) {
            this.orgMembers[contactId].image = url;
        }
    }
    public updateContactProfile(contactId: string, params: any) {
        if (!!this.orgMembers[contactId]) {
            var jsonObj = JSON.parse(JSON.stringify(params));
            if (!!jsonObj.displayname) {
                this.orgMembers[contactId].displayname = jsonObj.displayname;
            }
            if (!!jsonObj.status) {
                this.orgMembers[contactId].status = jsonObj.status;
            }
        }
    }
    public getContactProfile(contactId: string): ContactInfo {
        if (!!this.orgMembers[contactId]) {
            return this.orgMembers[contactId];
        }
        else {
            console.warn('this contactId is invalid. Maybe it not contain in list of contacts.');
        }
    }

    public onGetMe(dataEvent) {
        var self = this;
        var _profile = JSON.parse(JSON.stringify(dataEvent));
        if (dataEvent.code === 200) {
            this.setMyProfile(dataEvent.data);
        }
        else {
            console.error("get use profile fail!", dataEvent.message);
        }
    }
    public onGetCompanyInfo(dataEvent) {
        var self = this;
        var _company = JSON.parse(JSON.stringify(dataEvent));
        if (dataEvent.code === 200) {
            this.setCompanyInfo(dataEvent.data);
        }
        else {
            console.error("get company info fail!", dataEvent.message);
        }
    }

    public onGetCompanyMemberComplete(dataEvent) {
        let self = this;
        let members: Array<ContactInfo> = JSON.parse(JSON.stringify(dataEvent));

        if (!this.orgMembers) this.orgMembers = {};

        async.eachSeries(members, function iterator(item, cb) {
            if (!self.orgMembers[item._id]) {
                self.orgMembers[item._id] = item;
            }

            cb();
        }, function done(err) {
            self.isOrgMembersReady = true;
        });

        if (this.onContactsDataReady != null)
            this.onContactsDataReady();
    };
    public onGetOrganizeGroupsComplete(dataEvent) {
        var rooms: Array<Room> = JSON.parse(JSON.stringify(dataEvent));

        if (!this.orgGroups)
            this.orgGroups = {};

        rooms.forEach(value => {
            if (!this.orgGroups[value._id]) {
                this.orgGroups[value._id] = value;
            }
        });

        if (this.onOrgGroupDataReady != null) {
            this.onOrgGroupDataReady();
        }
    };
    public onGetProjectBaseGroupsComplete(dataEvent) {
        var groups: Array<Room> = JSON.parse(JSON.stringify(dataEvent));

        if (!this.projectBaseGroups) this.projectBaseGroups = {};

        groups.forEach(value => {
            if (!this.projectBaseGroups[value._id]) {
                this.projectBaseGroups[value._id] = value;
            }
        });

        if (this.onProjectBaseGroupsDataReady != null) {
            this.onProjectBaseGroupsDataReady();
        }
    };
    public onGetPrivateGroupsComplete(dataEvent) {
        var groups: Array<Room> = JSON.parse(JSON.stringify(dataEvent));

        if (!this.privateGroups) this.privateGroups = {};

        groups.forEach(value => {
            if (!this.privateGroups[value._id]) {
                this.privateGroups[value._id] = value;
            }
        });

        if (this.onPrivateGroupsDataReady != null) {
            this.onPrivateGroupsDataReady();
        }
    };
}