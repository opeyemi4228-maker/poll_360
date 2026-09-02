/**
 * Every presidential election since the return to civilian rule.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  GENERATED. Do not hand-edit — run scripts/build-history.mjs.
 *
 *  The by-state rows are parsed from the published tables rather than typed,
 *  because six elections is about a thousand figures and a thousand typed
 *  figures contains mistakes with certainty. The script checks every party's
 *  parsed total against that election's declared national figure before it
 *  writes anything, and prints the drift.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IS MISSING, STATED RATHER THAN HIDDEN ────────────────────────────
 * 2007 and 2011 carry national figures and no state rows. No by-state table
 * for either is published in this source: the 2007 presidential article has
 * none at all, and the 2011 one carries a full national result and nothing
 * beneath it. They are here because leaving two elections out would draw a
 * different country's history, and they are marked `stateLevel: false` so
 * nothing can silently treat their absence as zeroes.
 */

export const HISTORY = [
  {
    "year": 1999,
    "held": "1999-02-27",
    "parties": [
      {
        "id": "PDP",
        "name": "Peoples Democratic Party",
        "candidate": "Olusegun Obasanjo"
      },
      {
        "id": "AD-APP",
        "name": "AD–APP alliance",
        "candidate": "Olu Falae"
      }
    ],
    "national": {
      "PDP": 18738154,
      "AD-APP": 11110287
    },
    "electorate": 57938945,
    "cast": 30280052,
    "stateLevel": true,
    "rows": [
      {
        "code": "ABI",
        "votes": {
          "PDP": 360823,
          "AD-APP": 175095
        },
        "total": 535918
      },
      {
        "code": "ADA",
        "votes": {
          "PDP": 667239,
          "AD-APP": 177868
        },
        "total": 845107
      },
      {
        "code": "AKW",
        "votes": {
          "PDP": 730744,
          "AD-APP": 152534
        },
        "total": 883278
      },
      {
        "code": "ANA",
        "votes": {
          "PDP": 633717,
          "AD-APP": 199461
        },
        "total": 833178
      },
      {
        "code": "BAU",
        "votes": {
          "PDP": 834308,
          "AD-APP": 342233
        },
        "total": 1176541
      },
      {
        "code": "BAY",
        "votes": {
          "PDP": 457812,
          "AD-APP": 152220
        },
        "total": 610032
      },
      {
        "code": "BEN",
        "votes": {
          "PDP": 983912,
          "AD-APP": 269045
        },
        "total": 1252957
      },
      {
        "code": "BOR",
        "votes": {
          "PDP": 581382,
          "AD-APP": 334593
        },
        "total": 915975
      },
      {
        "code": "CRO",
        "votes": {
          "PDP": 592688,
          "AD-APP": 283468
        },
        "total": 876156
      },
      {
        "code": "DEL",
        "votes": {
          "PDP": 576230,
          "AD-APP": 240344
        },
        "total": 816574
      },
      {
        "code": "EBO",
        "votes": {
          "PDP": 250987,
          "AD-APP": 94934
        },
        "total": 345921
      },
      {
        "code": "EDO",
        "votes": {
          "PDP": 516581,
          "AD-APP": 163203
        },
        "total": 679784
      },
      {
        "code": "EKI",
        "votes": {
          "PDP": 191618,
          "AD-APP": 522072
        },
        "total": 713690
      },
      {
        "code": "ENU",
        "votes": {
          "PDP": 640418,
          "AD-APP": 195168
        },
        "total": 835586
      },
      {
        "code": "FCT",
        "votes": {
          "PDP": 59234,
          "AD-APP": 39788
        },
        "total": 99022
      },
      {
        "code": "GOM",
        "votes": {
          "PDP": 533158,
          "AD-APP": 311381
        },
        "total": 844539
      },
      {
        "code": "IMO",
        "votes": {
          "PDP": 421767,
          "AD-APP": 314339
        },
        "total": 736106
      },
      {
        "code": "JIG",
        "votes": {
          "PDP": 311571,
          "AD-APP": 237025
        },
        "total": 548596
      },
      {
        "code": "KAD",
        "votes": {
          "PDP": 1294679,
          "AD-APP": 381350
        },
        "total": 1676029
      },
      {
        "code": "KAN",
        "votes": {
          "PDP": 682255,
          "AD-APP": 222458
        },
        "total": 904713
      },
      {
        "code": "KAT",
        "votes": {
          "PDP": 964216,
          "AD-APP": 229181
        },
        "total": 1193397
      },
      {
        "code": "KEB",
        "votes": {
          "PDP": 339893,
          "AD-APP": 172336
        },
        "total": 512229
      },
      {
        "code": "KOG",
        "votes": {
          "PDP": 507903,
          "AD-APP": 476807
        },
        "total": 984710
      },
      {
        "code": "KWA",
        "votes": {
          "PDP": 470510,
          "AD-APP": 189088
        },
        "total": 659598
      },
      {
        "code": "LAG",
        "votes": {
          "PDP": 209012,
          "AD-APP": 1542969
        },
        "total": 1751981
      },
      {
        "code": "NAS",
        "votes": {
          "PDP": 423731,
          "AD-APP": 173277
        },
        "total": 597008
      },
      {
        "code": "NIG",
        "votes": {
          "PDP": 730665,
          "AD-APP": 140465
        },
        "total": 871130
      },
      {
        "code": "OGU",
        "votes": {
          "PDP": 143564,
          "AD-APP": 332340
        },
        "total": 475904
      },
      {
        "code": "OND",
        "votes": {
          "PDP": 133323,
          "AD-APP": 668474
        },
        "total": 801797
      },
      {
        "code": "OSU",
        "votes": {
          "PDP": 187011,
          "AD-APP": 607628
        },
        "total": 794639
      },
      {
        "code": "OYO",
        "votes": {
          "PDP": 227668,
          "AD-APP": 693510
        },
        "total": 921178
      },
      {
        "code": "PLA",
        "votes": {
          "PDP": 499072,
          "AD-APP": 173370
        },
        "total": 672442
      },
      {
        "code": "RIV",
        "votes": {
          "PDP": 1352275,
          "AD-APP": 213328
        },
        "total": 1565603
      },
      {
        "code": "SOK",
        "votes": {
          "PDP": 155598,
          "AD-APP": 198829
        },
        "total": 354427
      },
      {
        "code": "TAR",
        "votes": {
          "PDP": 789749,
          "AD-APP": 81290
        },
        "total": 871039
      },
      {
        "code": "YOB",
        "votes": {
          "PDP": 146517,
          "AD-APP": 165061
        },
        "total": 311578
      },
      {
        "code": "ZAM",
        "votes": {
          "PDP": 136324,
          "AD-APP": 243755
        },
        "total": 380079
      }
    ]
  },
  {
    "year": 2003,
    "held": "2003-04-19",
    "parties": [
      {
        "id": "PDP",
        "name": "Peoples Democratic Party",
        "candidate": "Olusegun Obasanjo"
      },
      {
        "id": "ANPP",
        "name": "All Nigeria Peoples Party",
        "candidate": "Muhammadu Buhari"
      },
      {
        "id": "APGA",
        "name": "All Progressives Grand Alliance",
        "candidate": "Chukwuemeka Ojukwu"
      },
      {
        "id": "OTH",
        "name": "Other parties",
        "candidate": "Sixteen other candidates"
      }
    ],
    "national": {
      "PDP": 24456140,
      "ANPP": 12710022,
      "APGA": 1297445,
      "OTH": 1016882
    },
    "electorate": 60823022,
    "cast": 42018735,
    "stateLevel": true,
    "rows": [
      {
        "code": "ABI",
        "votes": {
          "PDP": 386748,
          "ANPP": 84305,
          "APGA": 260899,
          "OTH": 16082
        },
        "total": 748034
      },
      {
        "code": "ADA",
        "votes": {
          "PDP": 660780,
          "ANPP": 285151,
          "APGA": 2352,
          "OTH": 7564
        },
        "total": 955847
      },
      {
        "code": "AKW",
        "votes": {
          "PDP": 1084574,
          "ANPP": 162542,
          "APGA": 1077,
          "OTH": 44202
        },
        "total": 1292395
      },
      {
        "code": "ANA",
        "votes": {
          "PDP": 466866,
          "ANPP": 79476,
          "APGA": 279378,
          "OTH": 36473
        },
        "total": 862193
      },
      {
        "code": "BAU",
        "votes": {
          "PDP": 617291,
          "ANPP": 1043442,
          "APGA": 1678,
          "OTH": 18131
        },
        "total": 1680542
      },
      {
        "code": "BAY",
        "votes": {
          "PDP": 708312,
          "ANPP": 18344,
          "APGA": 3,
          "OTH": 11506
        },
        "total": 738165
      },
      {
        "code": "BEN",
        "votes": {
          "PDP": 662422,
          "ANPP": 494804,
          "APGA": 6731,
          "OTH": 49886
        },
        "total": 1213843
      },
      {
        "code": "BOR",
        "votes": {
          "PDP": 380875,
          "ANPP": 727595,
          "APGA": 3549,
          "OTH": 8133
        },
        "total": 1120152
      },
      {
        "code": "CRO",
        "votes": {
          "PDP": 1207675,
          "ANPP": 11624,
          "APGA": 2112,
          "OTH": 11910
        },
        "total": 1233321
      },
      {
        "code": "DEL",
        "votes": {
          "PDP": 1072527,
          "ANPP": 27492,
          "APGA": 15062,
          "OTH": 27541
        },
        "total": 1142622
      },
      {
        "code": "EBO",
        "votes": {
          "PDP": 752823,
          "ANPP": 16308,
          "APGA": 20525,
          "OTH": 6970
        },
        "total": 796626
      },
      {
        "code": "EDO",
        "votes": {
          "PDP": 979775,
          "ANPP": 109401,
          "APGA": 2247,
          "OTH": 15389
        },
        "total": 1106812
      },
      {
        "code": "EKI",
        "votes": {
          "PDP": 301185,
          "ANPP": 7500,
          "APGA": 1300,
          "OTH": 15896
        },
        "total": 325881
      },
      {
        "code": "ENU",
        "votes": {
          "PDP": 897721,
          "ANPP": 18987,
          "APGA": 177050,
          "OTH": 33187
        },
        "total": 1126945
      },
      {
        "code": "FCT",
        "votes": {
          "PDP": 130243,
          "ANPP": 99220,
          "APGA": 22481,
          "OTH": 9219
        },
        "total": 261163
      },
      {
        "code": "GOM",
        "votes": {
          "PDP": 452328,
          "ANPP": 516081,
          "APGA": 1601,
          "OTH": 6126
        },
        "total": 976136
      },
      {
        "code": "IMO",
        "votes": {
          "PDP": 656861,
          "ANPP": 53983,
          "APGA": 281114,
          "OTH": 24523
        },
        "total": 1016481
      },
      {
        "code": "JIG",
        "votes": {
          "PDP": 202502,
          "ANPP": 885505,
          "APGA": 2136,
          "OTH": 11766
        },
        "total": 1101909
      },
      {
        "code": "KAD",
        "votes": {
          "PDP": 1025347,
          "ANPP": 870454,
          "APGA": 7800,
          "OTH": 14764
        },
        "total": 1918365
      },
      {
        "code": "KAN",
        "votes": {
          "PDP": 492755,
          "ANPP": 1628085,
          "APGA": 10229,
          "OTH": 41113
        },
        "total": 2172182
      },
      {
        "code": "KAT",
        "votes": {
          "PDP": 380914,
          "ANPP": 1259789,
          "APGA": 2928,
          "OTH": 9530
        },
        "total": 1653161
      },
      {
        "code": "KEB",
        "votes": {
          "PDP": 272564,
          "ANPP": 529512,
          "APGA": 3888,
          "OTH": 9255
        },
        "total": 815219
      },
      {
        "code": "KOG",
        "votes": {
          "PDP": 528778,
          "ANPP": 314494,
          "APGA": 2275,
          "OTH": 18442
        },
        "total": 863989
      },
      {
        "code": "KWA",
        "votes": {
          "PDP": 390800,
          "ANPP": 170325,
          "APGA": 2293,
          "OTH": 10951
        },
        "total": 574369
      },
      {
        "code": "LAG",
        "votes": {
          "PDP": 1129521,
          "ANPP": 116510,
          "APGA": 134764,
          "OTH": 247953
        },
        "total": 1628748
      },
      {
        "code": "NAS",
        "votes": {
          "PDP": 470936,
          "ANPP": 244005,
          "APGA": 1488,
          "OTH": 12837
        },
        "total": 729266
      },
      {
        "code": "NIG",
        "votes": {
          "PDP": 486621,
          "ANPP": 390103,
          "APGA": 11849,
          "OTH": 94633
        },
        "total": 983206
      },
      {
        "code": "OGU",
        "votes": {
          "PDP": 1360170,
          "ANPP": 680,
          "APGA": 27,
          "OTH": 374
        },
        "total": 1361251
      },
      {
        "code": "OND",
        "votes": {
          "PDP": 840988,
          "ANPP": 31994,
          "APGA": 4180,
          "OTH": 11701
        },
        "total": 888863
      },
      {
        "code": "OSU",
        "votes": {
          "PDP": 582089,
          "ANPP": 14369,
          "APGA": 1424,
          "OTH": 13711
        },
        "total": 611593
      },
      {
        "code": "OYO",
        "votes": {
          "PDP": 828725,
          "ANPP": 25112,
          "APGA": 4519,
          "OTH": 24215
        },
        "total": 882571
      },
      {
        "code": "PLA",
        "votes": {
          "PDP": 706432,
          "ANPP": 324566,
          "APGA": 6362,
          "OTH": 13010
        },
        "total": 1050370
      },
      {
        "code": "RIV",
        "votes": {
          "PDP": 2003521,
          "ANPP": 42346,
          "APGA": 5964,
          "OTH": 108302
        },
        "total": 2160133
      },
      {
        "code": "SOK",
        "votes": {
          "PDP": 232258,
          "ANPP": 681153,
          "APGA": 6869,
          "OTH": 8805
        },
        "total": 929085
      },
      {
        "code": "TAR",
        "votes": {
          "PDP": 694527,
          "ANPP": 198023,
          "APGA": 1179,
          "OTH": 12340
        },
        "total": 906069
      },
      {
        "code": "YOB",
        "votes": {
          "PDP": 206984,
          "ANPP": 383583,
          "APGA": 3522,
          "OTH": 5042
        },
        "total": 599131
      },
      {
        "code": "ZAM",
        "votes": {
          "PDP": 200702,
          "ANPP": 843159,
          "APGA": 4590,
          "OTH": 5400
        },
        "total": 1053851
      }
    ]
  },
  {
    "year": 2007,
    "held": "2007-04-21",
    "parties": [
      {
        "id": "PDP",
        "name": "Peoples Democratic Party",
        "candidate": "Umaru Musa Yar'Adua"
      },
      {
        "id": "ANPP",
        "name": "All Nigeria Peoples Party",
        "candidate": "Muhammadu Buhari"
      },
      {
        "id": "AC",
        "name": "Action Congress",
        "candidate": "Atiku Abubakar"
      },
      {
        "id": "OTH",
        "name": "Other parties",
        "candidate": "Fifteen other candidates"
      }
    ],
    "national": {
      "PDP": 24638063,
      "ANPP": 6605299,
      "AC": 2637848,
      "OTH": 1015000
    },
    "electorate": 61567036,
    "cast": 35397517,
    "stateLevel": false,
    "rows": []
  },
  {
    "year": 2011,
    "held": "2011-04-16",
    "parties": [
      {
        "id": "PDP",
        "name": "Peoples Democratic Party",
        "candidate": "Goodluck Jonathan"
      },
      {
        "id": "CPC",
        "name": "Congress for Progressive Change",
        "candidate": "Muhammadu Buhari"
      },
      {
        "id": "ACN",
        "name": "Action Congress of Nigeria",
        "candidate": "Nuhu Ribadu"
      },
      {
        "id": "ANPP",
        "name": "All Nigeria Peoples Party",
        "candidate": "Ibrahim Shekarau"
      },
      {
        "id": "OTH",
        "name": "Other parties",
        "candidate": "Sixteen other candidates"
      }
    ],
    "national": {
      "PDP": 22495187,
      "CPC": 12214853,
      "ACN": 2079151,
      "ANPP": 917012,
      "OTH": 503575
    },
    "electorate": 73528040,
    "cast": 39469484,
    "stateLevel": false,
    "rows": []
  },
  {
    "year": 2015,
    "held": "2015-03-28",
    "parties": [
      {
        "id": "APC",
        "name": "All Progressives Congress",
        "candidate": "Muhammadu Buhari"
      },
      {
        "id": "PDP",
        "name": "Peoples Democratic Party",
        "candidate": "Goodluck Jonathan"
      },
      {
        "id": "OTH",
        "name": "Other parties",
        "candidate": "Twelve other candidates"
      }
    ],
    "national": {
      "APC": 15424921,
      "PDP": 12853162,
      "OTH": 309481
    },
    "electorate": 67422005,
    "cast": 29432083,
    "stateLevel": true,
    "rows": [
      {
        "code": "ABI",
        "votes": {
          "APC": 13394,
          "PDP": 368303,
          "OTH": 9348
        },
        "total": 391045
      },
      {
        "code": "ADA",
        "votes": {
          "APC": 374701,
          "PDP": 251664,
          "OTH": 9653
        },
        "total": 636018
      },
      {
        "code": "AKW",
        "votes": {
          "APC": 58411,
          "PDP": 953304,
          "OTH": 5349
        },
        "total": 1017064
      },
      {
        "code": "ANA",
        "votes": {
          "APC": 17926,
          "PDP": 660762,
          "OTH": 9896
        },
        "total": 688584
      },
      {
        "code": "BAU",
        "votes": {
          "APC": 931598,
          "PDP": 86085,
          "OTH": 2655
        },
        "total": 1020338
      },
      {
        "code": "BAY",
        "votes": {
          "APC": 5194,
          "PDP": 361209,
          "OTH": 664
        },
        "total": 367067
      },
      {
        "code": "BEN",
        "votes": {
          "APC": 373961,
          "PDP": 303737,
          "OTH": 5566
        },
        "total": 683264
      },
      {
        "code": "BOR",
        "votes": {
          "APC": 473543,
          "PDP": 25640,
          "OTH": 2737
        },
        "total": 501920
      },
      {
        "code": "CRO",
        "votes": {
          "APC": 28368,
          "PDP": 414863,
          "OTH": 7283
        },
        "total": 450514
      },
      {
        "code": "DEL",
        "votes": {
          "APC": 48910,
          "PDP": 1211405,
          "OTH": 7458
        },
        "total": 1267773
      },
      {
        "code": "EBO",
        "votes": {
          "APC": 19518,
          "PDP": 323653,
          "OTH": 20717
        },
        "total": 363888
      },
      {
        "code": "EDO",
        "votes": {
          "APC": 208469,
          "PDP": 286869,
          "OTH": 5113
        },
        "total": 500451
      },
      {
        "code": "EKI",
        "votes": {
          "APC": 120331,
          "PDP": 176466,
          "OTH": 3894
        },
        "total": 300691
      },
      {
        "code": "ENU",
        "votes": {
          "APC": 14157,
          "PDP": 553003,
          "OTH": 6013
        },
        "total": 573173
      },
      {
        "code": "GOM",
        "votes": {
          "APC": 361245,
          "PDP": 96873,
          "OTH": 2481
        },
        "total": 460599
      },
      {
        "code": "IMO",
        "votes": {
          "APC": 133253,
          "PDP": 559185,
          "OTH": 10526
        },
        "total": 702964
      },
      {
        "code": "JIG",
        "votes": {
          "APC": 885988,
          "PDP": 142904,
          "OTH": 8672
        },
        "total": 1037564
      },
      {
        "code": "KAD",
        "votes": {
          "APC": 1127760,
          "PDP": 484085,
          "OTH": 5637
        },
        "total": 1617482
      },
      {
        "code": "KAN",
        "votes": {
          "APC": 1903999,
          "PDP": 215779,
          "OTH": 9043
        },
        "total": 2128821
      },
      {
        "code": "KAT",
        "votes": {
          "APC": 1345441,
          "PDP": 98937,
          "OTH": 5048
        },
        "total": 1449426
      },
      {
        "code": "KEB",
        "votes": {
          "APC": 567883,
          "PDP": 100972,
          "OTH": 8148
        },
        "total": 677003
      },
      {
        "code": "KOG",
        "votes": {
          "APC": 264851,
          "PDP": 149987,
          "OTH": 6490
        },
        "total": 421328
      },
      {
        "code": "KWA",
        "votes": {
          "APC": 302146,
          "PDP": 132602,
          "OTH": 5332
        },
        "total": 440080
      },
      {
        "code": "LAG",
        "votes": {
          "APC": 792460,
          "PDP": 632327,
          "OTH": 18899
        },
        "total": 1443686
      },
      {
        "code": "NAS",
        "votes": {
          "APC": 236838,
          "PDP": 273460,
          "OTH": 1249
        },
        "total": 511547
      },
      {
        "code": "NIG",
        "votes": {
          "APC": 657678,
          "PDP": 149222,
          "OTH": 6771
        },
        "total": 813671
      },
      {
        "code": "OGU",
        "votes": {
          "APC": 308290,
          "PDP": 207950,
          "OTH": 16932
        },
        "total": 533172
      },
      {
        "code": "OND",
        "votes": {
          "APC": 299889,
          "PDP": 251368,
          "OTH": 9799
        },
        "total": 561056
      },
      {
        "code": "OSU",
        "votes": {
          "APC": 383603,
          "PDP": 249929,
          "OTH": 9083
        },
        "total": 642615
      },
      {
        "code": "OYO",
        "votes": {
          "APC": 528620,
          "PDP": 303376,
          "OTH": 49356
        },
        "total": 881352
      },
      {
        "code": "PLA",
        "votes": {
          "APC": 429140,
          "PDP": 549615,
          "OTH": 3633
        },
        "total": 982388
      },
      {
        "code": "RIV",
        "votes": {
          "APC": 69238,
          "PDP": 1487075,
          "OTH": 9148
        },
        "total": 1565461
      },
      {
        "code": "SOK",
        "votes": {
          "APC": 671926,
          "PDP": 152199,
          "OTH": 10134
        },
        "total": 834259
      },
      {
        "code": "TAR",
        "votes": {
          "APC": 261326,
          "PDP": 310800,
          "OTH": 7551
        },
        "total": 579677
      },
      {
        "code": "YOB",
        "votes": {
          "APC": 446265,
          "PDP": 25526,
          "OTH": 2005
        },
        "total": 473796
      },
      {
        "code": "ZAM",
        "votes": {
          "APC": 612202,
          "PDP": 144833,
          "OTH": 3987
        },
        "total": 761022
      },
      {
        "code": "FCT",
        "votes": {
          "APC": 146399,
          "PDP": 157195,
          "OTH": 3211
        },
        "total": 306805
      }
    ]
  },
  {
    "year": 2019,
    "held": "2019-02-23",
    "parties": [
      {
        "id": "APC",
        "name": "All Progressives Congress",
        "candidate": "Muhammadu Buhari"
      },
      {
        "id": "PDP",
        "name": "Peoples Democratic Party",
        "candidate": "Atiku Abubakar"
      },
      {
        "id": "PCP",
        "name": "Peoples Coalition Party",
        "candidate": "Felix Nicolas"
      },
      {
        "id": "ADC",
        "name": "African Democratic Congress",
        "candidate": "Obadiah Mailafia"
      },
      {
        "id": "AAC",
        "name": "African Action Congress",
        "candidate": "Gbor Terwase"
      },
      {
        "id": "OTH",
        "name": "Other parties",
        "candidate": "Sixty-eight other candidates"
      }
    ],
    "national": {
      "APC": 15191847,
      "PDP": 11262978,
      "PCP": 107286,
      "ADC": 97874,
      "AAC": 66851,
      "OTH": 597747
    },
    "electorate": 82344107,
    "cast": 28614190,
    "stateLevel": true,
    "rows": [
      {
        "code": "ABI",
        "votes": {
          "APC": 85058,
          "PDP": 219698,
          "PCP": 1489,
          "ADC": 336,
          "AAC": 9638,
          "OTH": 7072
        },
        "total": 323291
      },
      {
        "code": "ADA",
        "votes": {
          "APC": 378078,
          "PDP": 410266,
          "PCP": 3670,
          "ADC": 3989,
          "AAC": 159,
          "OTH": 15372
        },
        "total": 811534
      },
      {
        "code": "AKW",
        "votes": {
          "APC": 175429,
          "PDP": 395832,
          "PCP": 1902,
          "ADC": 230,
          "AAC": 61,
          "OTH": 5321
        },
        "total": 578775
      },
      {
        "code": "ANA",
        "votes": {
          "APC": 33298,
          "PDP": 524738,
          "PCP": 4374,
          "ADC": 227,
          "AAC": 30034,
          "OTH": 13063
        },
        "total": 605734
      },
      {
        "code": "BAU",
        "votes": {
          "APC": 798428,
          "PDP": 209313,
          "PCP": 2104,
          "ADC": 296,
          "AAC": 149,
          "OTH": 14017
        },
        "total": 1024307
      },
      {
        "code": "BAY",
        "votes": {
          "APC": 118821,
          "PDP": 197933,
          "PCP": 1584,
          "ADC": 1078,
          "AAC": 53,
          "OTH": 2298
        },
        "total": 321767
      },
      {
        "code": "BEN",
        "votes": {
          "APC": 347668,
          "PDP": 356817,
          "PCP": 2793,
          "ADC": 554,
          "AAC": 4582,
          "OTH": 16498
        },
        "total": 728912
      },
      {
        "code": "BOR",
        "votes": {
          "APC": 836496,
          "PDP": 71788,
          "PCP": 1563,
          "ADC": 301,
          "AAC": 187,
          "OTH": 9451
        },
        "total": 919786
      },
      {
        "code": "CRO",
        "votes": {
          "APC": 117302,
          "PDP": 295737,
          "PCP": 2033,
          "ADC": 326,
          "AAC": 43,
          "OTH": 6460
        },
        "total": 421901
      },
      {
        "code": "DEL",
        "votes": {
          "APC": 221292,
          "PDP": 594068,
          "PCP": 2753,
          "ADC": 1075,
          "AAC": 145,
          "OTH": 10429
        },
        "total": 829762
      },
      {
        "code": "EBO",
        "votes": {
          "APC": 90726,
          "PDP": 258573,
          "PCP": 1637,
          "ADC": 213,
          "AAC": 222,
          "OTH": 7760
        },
        "total": 359131
      },
      {
        "code": "EDO",
        "votes": {
          "APC": 267842,
          "PDP": 275691,
          "PCP": 3526,
          "ADC": 850,
          "AAC": 143,
          "OTH": 12659
        },
        "total": 560711
      },
      {
        "code": "EKI",
        "votes": {
          "APC": 219231,
          "PDP": 154032,
          "PCP": 2299,
          "ADC": 406,
          "AAC": 39,
          "OTH": 5125
        },
        "total": 381132
      },
      {
        "code": "ENU",
        "votes": {
          "APC": 54423,
          "PDP": 355553,
          "PCP": 2337,
          "ADC": 348,
          "AAC": 1618,
          "OTH": 6735
        },
        "total": 421014
      },
      {
        "code": "FCT",
        "votes": {
          "APC": 152224,
          "PDP": 259997,
          "PCP": 2921,
          "ADC": 246,
          "AAC": 255,
          "OTH": 8308
        },
        "total": 423951
      },
      {
        "code": "GOM",
        "votes": {
          "APC": 402961,
          "PDP": 138484,
          "PCP": 1679,
          "ADC": 248,
          "AAC": 124,
          "OTH": 10707
        },
        "total": 554203
      },
      {
        "code": "IMO",
        "votes": {
          "APC": 140463,
          "PDP": 334923,
          "PCP": 4883,
          "ADC": 541,
          "AAC": 10880,
          "OTH": 19896
        },
        "total": 511586
      },
      {
        "code": "JIG",
        "votes": {
          "APC": 794738,
          "PDP": 289895,
          "PCP": 2761,
          "ADC": 261,
          "AAC": 140,
          "OTH": 18449
        },
        "total": 1106244
      },
      {
        "code": "KAD",
        "votes": {
          "APC": 993445,
          "PDP": 649612,
          "PCP": 4027,
          "ADC": 558,
          "AAC": 749,
          "OTH": 15212
        },
        "total": 1663603
      },
      {
        "code": "KAN",
        "votes": {
          "APC": 1464768,
          "PDP": 391593,
          "PCP": 3568,
          "ADC": 591,
          "AAC": 549,
          "OTH": 30065
        },
        "total": 1891134
      },
      {
        "code": "KAT",
        "votes": {
          "APC": 1232133,
          "PDP": 308056,
          "PCP": 2399,
          "ADC": 237,
          "AAC": 331,
          "OTH": 12317
        },
        "total": 1555473
      },
      {
        "code": "KEB",
        "votes": {
          "APC": 581552,
          "PDP": 154282,
          "PCP": 1794,
          "ADC": 285,
          "AAC": 228,
          "OTH": 18464
        },
        "total": 756605
      },
      {
        "code": "KOG",
        "votes": {
          "APC": 285894,
          "PDP": 218207,
          "PCP": 2207,
          "ADC": 4369,
          "AAC": 318,
          "OTH": 10021
        },
        "total": 521016
      },
      {
        "code": "KWA",
        "votes": {
          "APC": 308984,
          "PDP": 138184,
          "PCP": 2108,
          "ADC": 456,
          "AAC": 89,
          "OTH": 9855
        },
        "total": 459676
      },
      {
        "code": "LAG",
        "votes": {
          "APC": 580825,
          "PDP": 448015,
          "PCP": 8458,
          "ADC": 2915,
          "AAC": 499,
          "OTH": 48855
        },
        "total": 1089567
      },
      {
        "code": "NAS",
        "votes": {
          "APC": 289903,
          "PDP": 283847,
          "PCP": 1868,
          "ADC": 339,
          "AAC": 1523,
          "OTH": 3298
        },
        "total": 580778
      },
      {
        "code": "NIG",
        "votes": {
          "APC": 612371,
          "PDP": 218052,
          "PCP": 2855,
          "ADC": 588,
          "AAC": 389,
          "OTH": 17682
        },
        "total": 851937
      },
      {
        "code": "OGU",
        "votes": {
          "APC": 281762,
          "PDP": 194655,
          "PCP": 3563,
          "ADC": 25283,
          "AAC": 222,
          "OTH": 58771
        },
        "total": 564256
      },
      {
        "code": "OND",
        "votes": {
          "APC": 241769,
          "PDP": 275901,
          "PCP": 4829,
          "ADC": 6296,
          "AAC": 90,
          "OTH": 27109
        },
        "total": 555994
      },
      {
        "code": "OSU",
        "votes": {
          "APC": 347634,
          "PDP": 337377,
          "PCP": 4888,
          "ADC": 1525,
          "AAC": 73,
          "OTH": 23185
        },
        "total": 714682
      },
      {
        "code": "OYO",
        "votes": {
          "APC": 365229,
          "PDP": 366690,
          "PCP": 5352,
          "ADC": 40830,
          "AAC": 197,
          "OTH": 58233
        },
        "total": 836531
      },
      {
        "code": "PLA",
        "votes": {
          "APC": 468555,
          "PDP": 548665,
          "PCP": 4276,
          "ADC": 590,
          "AAC": 160,
          "OTH": 12607
        },
        "total": 1034853
      },
      {
        "code": "RIV",
        "votes": {
          "APC": 150710,
          "PDP": 473971,
          "PCP": 2954,
          "ADC": 597,
          "AAC": 614,
          "OTH": 13319
        },
        "total": 642165
      },
      {
        "code": "SOK",
        "votes": {
          "APC": 490333,
          "PDP": 361604,
          "PCP": 2630,
          "ADC": 331,
          "AAC": 313,
          "OTH": 16680
        },
        "total": 871891
      },
      {
        "code": "TAR",
        "votes": {
          "APC": 324906,
          "PDP": 374743,
          "PCP": 321,
          "ADC": 211,
          "AAC": 1071,
          "OTH": 11625
        },
        "total": 712877
      },
      {
        "code": "YOB",
        "votes": {
          "APC": 497914,
          "PDP": 50763,
          "PCP": 2107,
          "ADC": 162,
          "AAC": 226,
          "OTH": 8193
        },
        "total": 559365
      },
      {
        "code": "ZAM",
        "votes": {
          "APC": 438682,
          "PDP": 125423,
          "PCP": 774,
          "ADC": 186,
          "AAC": 738,
          "OTH": 12636
        },
        "total": 578439
      }
    ]
  }
];

/** The elections that can be drawn on a map, as opposed to only on a chart. */
export const WITH_STATES = HISTORY.filter((election) => election.stateLevel);
