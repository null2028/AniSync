import API, { ProviderType } from "./API";
import AniList, { Type, Media, Format } from "./meta/AniList";
import { compareTwoStrings } from "./libraries/StringSimilarity";
import AnimeFox from "./anime/AnimeFox";
import GogoAnime from "./anime/GogoAnime";
import Enime from "./anime/Enime";
import AnimePahe from "./anime/AnimePahe";
import Zoro from "./anime/Zoro";
import ComicK from "./manga/ComicK";
import MangaDex from "./manga/MangaDex";
import Mangakakalot from "./manga/Mangakakalot";
import MangaPark from "./manga/MangaPark";
import MangaSee from "./manga/MangaSee";
import DB from "./DB";
import * as config from "./config.json";
import * as colors from "colors";
import AnimeThemes from "./meta/AnimeThemes";
import TMDB from "./meta/TMDB";
import KitsuAnime from "./meta/KitsuAnime";
import KitsuManga from "./meta/KitsuManga";
import LiveChart from "./meta/LiveChart";

export default class Sync extends API {
    private aniList = new AniList();

    private db = new DB();

    public classDictionary:Provider[] = [];

    constructor() {
        super(ProviderType.NONE);

        // Class dictionary of all providers. Used for looping through and searching.
        this.classDictionary = [
            // Zoro has CloudFlare sometimes
            {
                name: "Zoro",
                object: new Zoro(),
            },
            {
                name: "AnimeFox",
                object: new AnimeFox(),
            },
            {
                name: "AnimePahe",
                object: new AnimePahe(),
            },
            {
                name: "Enime",
                object: new Enime(),
            },
            {
                name: "GogoAnime",
                object: new GogoAnime(),
            },
            {
                name: "ComicK",
                object: new ComicK(),
            },
            {
                name: "MangaDex",
                object: new MangaDex(),
            },
            {
                name: "Mangakakalot",
                object: new Mangakakalot(),
            },
            {
                name: "MangaPark",
                object: new MangaPark(),
            },
            {
                name: "MangaSee",
                object: new MangaSee(),
            },
            {
                name: "AnimeThemes",
                object: new AnimeThemes(),
            },
            {
                name: "TMDB",
                object: new TMDB(),
            },
            {
                name: "KitsuAnime",
                object: new KitsuAnime(),
            },
            {
                name: "KitsuManga",
                object: new KitsuManga(),
            },
            {
                name: "LiveChart",
                object: new LiveChart(),
            }
        ]
    }

    public async init() {
        await this.db.init();
    }

    /**
     * @description Searches on AniList and on providers and finds the best results possible.
     * @param query Media to search for.
     * @param type Type of media to search for.
     * @returns Promise<FormattedResponse[]>
     */
    public async search(query:string, type:Type): Promise<FormattedResponse[]> {
        let result:FormattedResponse[] = [];
        // Searches first on the database for a result
        const possible = await this.db.search(query, type);
        if (!possible || possible.length === 0) {
            if (config.debug) {
                console.log(colors.yellow("No results found in database. Searching providers..."));
                console.log(colors.gray("Searching for ") + colors.blue(query) + colors.gray(" of type ") + colors.blue(type) + colors.gray("..."));
            }
            // Search on AniList first
            const aniSearch = await this.aniSearch(query, type);
            if (config.debug) {
                console.log(colors.gray("Received ") + colors.blue("AniList") + colors.gray(" response."));
            }
            const aniList = this.searchCompare(result, aniSearch);
            // Then search on providers
            const pageSearch = await this.pageSearch(query, type);
            if (config.debug) {
                console.log(colors.gray("Received ") + colors.blue("Provider") + colors.gray(" response."));
            }
            // Find the best results possible
            const pageList = this.searchCompare(aniList, pageSearch, 0.5);
            await this.db.insert(pageList, type);
            return pageList;
        } else {
            return possible;
        }
    }

    /**
     * @description Searches for media on AniList and maps the results to providers.
     * @param query Media to search for.
     * @param type Type of media to search for.
     * @returns Promise<FormattedResponse[]>
     */
    public async aniSearch(query:string, type:Type): Promise<FormattedResponse[]> {
        const results:SearchResponse[] = [];

        const aniList = await this.aniList.search(query, type);

        const promises = [];
        for (let i = 0; i < this.classDictionary.length; i++) {
            const provider:any = this.classDictionary[i];
            if (provider.object.providerType === type) {
                promises.push(provider.object.search(query));
            }
        }

        const resultsArray = await Promise.all(promises);
        for (let i = 0; i < resultsArray.length; i++) {
            for (let j = 0; j < resultsArray[i].length; j++) {
                let best: any = null;
    
                aniList.map(async (result:any) => {
                    if (type === Type.MANGA) {
                        if (result.format === Format.NOVEL) {
                            return;
                        }
                    }
                    const title = result.title.userPreferred || result.title.romaji || result.title.english || result.title.native;
                    const altTitles:any[] = Object.values(result.title).concat(result.synonyms);
                    const aniList = result;
    
                    const sim = this.similarity(title, resultsArray[i][j].title, altTitles);
                    const tempBest = {
                        index: j,
                        similarity: sim,
                        aniList: aniList,
                    };
    
                    if (!best || sim.value > best.similarity.value) {
                        best = tempBest;
                    }
                });
                if (best) {
                    const retEl = resultsArray[i][best.index];
                    results.push({
                        id: retEl.url,
                        data: best.aniList,
                        similarity: best.similarity,
                    });
                }
            }
        }
        return this.formatSearch(results);
    }

    /**
     * @description Searches for media on all providers and maps the results to AniList.
     * @param query Media to search for.
     * @param type Type of media to search for.
     * @returns Promise<FormattedResponse[]>
     */
    public async pageSearch(query:string, type:Type): Promise<FormattedResponse[]> {
        const results:SearchResponse[] = [];

        const promises = [];
        for (let i = 0; i < this.classDictionary.length; i++) {
            const provider:any = this.classDictionary[i];
            if (provider.object.providerType === type) {
                promises.push(provider.object.search(query));
            }
        }
        const resultsArray = await Promise.all(promises);
        
        for (let i = 0; i < resultsArray.length; i++) {
            for (let j = 0; j < resultsArray[i].length; j++) {
                const aniSearch = await this.aniList.search(this.sanitizeTitle(resultsArray[i][j].title), type);
            
                let best: any = null;

                aniSearch.map(async (result:any) => {
                    const title = result.title.userPreferred || result.title.english || result.title.romaji || result.title.native;
                    const altTitles:any[] = Object.values(result.title).concat(result.synonyms);
                    const aniList = result;
    
                    const sim = this.similarity(title, resultsArray[i][j].title, altTitles);
                    const tempBest = {
                        index: j,
                        similarity: sim,
                        aniList: aniList,
                    };
    
                    if (!best || sim.value > best.similarity.value) {
                        best = tempBest;
                    }
                });
                if (best) {
                    const retEl = resultsArray[i][best.index];
                    results.push({
                        id: retEl.url,
                        data: best.aniList,
                        similarity: best.similarity,
                    });
                }
            }
        }
        let data = this.formatSearch(results);
        return data;
    }

    /**
     * 
     * @param id AniList ID of the media to get
     * @returns 
     */
    public async get(id:string): Promise<FormattedResponse> {
        const aniList = await this.aniList.getMedia(id);
        if (!aniList) {
            return null;
        }
        const possible = await this.db.get(id, aniList.type);
        if (!possible) {
            let result:FormattedResponse = null;
            const results = await this.search(aniList.title.userPreferred, aniList.type);
            for (let i = 0; i < results.length; i++) {
                if (results[i].id === id) {
                    result = results[i];
                }
            }
            return result;
        } else {
            return possible;
        }
    }

    /**
     * @description Formats search responses so that all connectors are assigned to one AniList media object.
     * @param results Search results
     * @returns FormattedResponse[]
     */
    private formatSearch(results:SearchResponse[]): FormattedResponse[] {
        const formatted:FormattedResponse[] = [];

        for (let i = 0; i < results.length; i++) {
            const item:any = results[i];
            let hasPushed = false;
            for (let j = 0; j < formatted.length; j++) {
                if (formatted[j].data.id === item.data.id) {
                    hasPushed = true;
                    formatted[j].connectors.push(
                        {
                            id: item.id,
                            similarity: item.similarity
                        }
                    );
                }
            }
            if (!hasPushed) {
                item.connectors = [
                    {
                        id: item.id,
                        similarity: item.similarity
                    }
                ];
                item.id = item.data.id;
                const temp = {
                    id: item.id,
                    data: item.data,
                    connectors: item.connectors,
                };
                formatted.push(temp);
            }
        }
        return formatted;
    }

    /**
     * @description Crawls the provider for media.
     * @param type Type of media to crawl
     * @param maxIds Max IDs to crawl
     * @returns Promise<any>
     */
    public async crawl(type:Type, maxIds?:number): Promise<FormattedResponse[]> {

        const results = [];

        let ids = [];
        if (type === Type.ANIME) {
            ids = await this.aniList.getAnimeIDs();
        } else if (type === Type.MANGA) {
            ids = await this.aniList.getMangaIDs();
        } else {
            throw new Error("Unknown type.");
        }

        maxIds = maxIds ? maxIds : ids.length;

        for (let i = 0; i < ids.length || maxIds; i++) {
            if (i >= maxIds) {
                break;
            }
            const possible = await this.db.get(ids[i], type);
            if (!possible) {
                const start = new Date(Date.now());

                const data = await this.aniList.getMedia(ids[i]).catch((err) => {
                    if (config.debug) {
                        console.log(colors.red("Error fetching ID: ") + colors.white(ids[i] + ""));
                    }
                    return null;
                });
                if (data) {
                    const result = await this.get(ids[i]).catch((err) => {
                        if (config.debug) {
                            console.log(colors.red("Error fetching ID from providers: ") + colors.white(ids[i] + ""));
                            console.log(colors.gray(err.message));
                        }
                        return null;
                    });
                    if (result) {
                        results.push(result);
                    }
                }
                if (config.debug) {
                    const end = new Date(Date.now());
                    console.log(colors.gray("Finished fetching data. Request(s) took ") + colors.cyan(String(end.getTime() - start.getTime())) + colors.gray(" milliseconds."));
                    console.log(colors.green("Fetched ID ") + colors.blue("#" + (i + 1) + "/" + maxIds));
                }
            }
        }

        if (config.debug) {
            console.log(colors.green("Crawling finished."));
        }
        return results;
    }

    /**
     * @description Compares the similarity between the external title and the title from the provider.
     * @param externalTitle Title from AniList/MAL
     * @param title Title from provider
     * @param titleArray Alt titles from provider
     * @returns { same: boolean, value: number }
     */
    public similarity(externalTitle, title, titleArray: string[] = []): { same: boolean, value: number } {
        let simi = compareTwoStrings(this.sanitizeTitle(title.toLowerCase()), externalTitle.toLowerCase());
        titleArray.forEach(el => {
            if (el) {
                const tempSimi = compareTwoStrings(title.toLowerCase(), el.toLowerCase());
                if (tempSimi > simi) simi = tempSimi;
            }
        });
        let found = false;
        if (simi > 0.6) {
            found = true;
        }

        return {
            same: found,
            value: simi,
        };
    }

    /**
     * @description Used for removing unnecessary information from the title.
     * @param title Title to sanitize.
     * @returns string
     */
    public sanitizeTitle(title):string {
        let resTitle = title.replace(
            / *(\(dub\)|\(sub\)|\(uncensored\)|\(uncut\)|\(subbed\)|\(dubbed\))/i,
            '',
        );
        resTitle = resTitle.replace(/ *\([^)]+audio\)/i, '');
        resTitle = resTitle.replace(/ BD( |$)/i, '');
        resTitle = resTitle.replace(/\(TV\)/g, '');
        resTitle = resTitle.trim();
        resTitle = resTitle.substring(0, 99); // truncate
        return resTitle;
    }

    /**
     * @description Compares two responses and replaces results that have a better response
     * @param curVal Original response
     * @param newVal New response to compare
     * @param threshold Optional minimum threshold required
     * @returns FormattedResponse[]
     */
    private searchCompare(curVal:FormattedResponse[], newVal:FormattedResponse[], threshold = 0):FormattedResponse[] {
        const res = [];
        if (curVal.length > 0 && newVal.length > 0) {
            for (let i = 0; i < curVal.length; i++) {
                for (let j = 0; j < newVal.length; j++) {
                    if (curVal[i].id === newVal[j].id) {
                        // Can compare now
                        const connectors = [];
                        for (let k = 0; k < curVal[i].connectors.length; k++) {
                            for (let l = 0; l < newVal[j].connectors.length; l++) {
                                if (curVal[i].connectors[k].id === newVal[j].connectors[l].id) {
                                    // Compare similarity
                                    if (newVal[j].connectors[l].similarity < threshold || curVal[i].connectors[k].similarity.value >= newVal[j].connectors[l].similarity.value) {
                                        connectors.push(curVal[i].connectors[k]);
                                    } else {
                                        connectors.push(newVal[j].connectors[l]);
                                    }
                                }
                            }
                        }
                        res.push({
                            id: curVal[i].id,
                            data: curVal[i].data,
                            connectors,
                        });
                    }
                }
            }
            return res;
        }
        if (curVal.length > 0) return curVal;
        return newVal;
    }

    /**
     * @description Exports the database to a JSON file.
     * @param type Type of media to export
     */
    public async export(type:Type): Promise<void> {
        await this.db.export(type);
    }
}

interface Result {
    title: string;
    altTitles?: string[];
    url: string;
}

interface Provider {
    name: string;
    object: any;
}

interface FormattedResponse {
    id: string;
    data: Media;
    connectors: any[];
}

interface SearchResponse {
    id: string; // The provider's URL
    data: Media;
    similarity: {
        same: boolean;
        value: number;
    };
}

export type { Result, Provider, FormattedResponse, SearchResponse };

/*
sqlite> CREATE TABLE anime(id int(7) not null, data longtext not null);
sqlite> CREATE TABLE manga(id int(7) not null, data longtext not null);
*/