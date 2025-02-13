﻿class Member {
    public id: string;
    public role: MemberRole = MemberRole.member;
    public joinTime: string;
    public status: string;
    public jobPosition: string;
    public textRole: string;
}

enum MemberRole {
    member, admin
}
